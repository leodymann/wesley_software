from __future__ import annotations

import enum
from datetime import datetime, date
from decimal import Decimal
from typing import Optional, List

from sqlalchemy import (
    String, Integer, DateTime, Date, Numeric, ForeignKey, Text,
    Enum as SAEnum, UniqueConstraint, Index, func
)

from sqlalchemy.orm import (
    DeclarativeBase, Mapped, mapped_column, relationship
)


# base
class Base(DeclarativeBase):
    pass

# enums = status
class UserRole(str, enum.Enum):
    ADMIN = "ADMIN"
    STAFF = "STAFF"

class ProductStatus(str, enum.Enum):
    IN_STOCK = "IN_STOCK"
    RESERVED = "RESERVED"
    SOLD = "SOLD"

class PaymentType(str, enum.Enum):
    CASH = "CASH"
    PIX = "PIX"
    CARD = "CARD"
    PROMISSORY = "PROMISSORY"

class SaleStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    CONFIRMED = "CONFIRMED"
    CANCELED = "CANCELED"

class PromissoryStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    ISSUED = "ISSUED"
    CANCELED = "CANCELED"
    PAID = "PAID"

class InstallmentStatus(str, enum.Enum):
    PENDING = "PENDING"
    PAID = "PAID"
    CANCELED = "CANCELED"

class FinanceStatus(str, enum.Enum):
    PENDING = "PENDING"
    PAID = "PAID"
    CANCELED = "CANCELED"

class WppSendStatus(str, enum.Enum):
    PENDING = "PENDING"
    SENDING = "SENDING"
    SENT = "SENT"
    FAILED = "FAILED"

# models
class UserORM(Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("email", name="uq_users_email"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(160), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    role: Mapped[UserRole] = mapped_column(
        SAEnum(UserRole, name="user_role"), nullable=False, default=UserRole.STAFF
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    sales: Mapped[List["SaleORM"]] = relationship(back_populates="user")

class ClientORM(Base):
    __tablename__ = "clients"
    __table_args__ = (
        Index("ix_clients_phone", "phone"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str]= mapped_column(String(140), nullable=False)
    phone: Mapped[str]= mapped_column(String(11), nullable=False)
    cpf: Mapped[Optional[str]] = mapped_column(String(11), nullable=True)
    address: Mapped[Optional[str]]= mapped_column(String(255), nullable=True)
    notes: Mapped[Optional[str]]= mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    sales: Mapped[List["SaleORM"]] = relationship(back_populates="client")
    promissories: Mapped[List["PromissoryORM"]] = relationship(back_populates="client")

class ProductORM(Base):
    __tablename__ = "products"
    __table_args__ = (
        Index("ix_products_status", "status"),
        Index("ix_products_brand_model", "brand", "model"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    brand: Mapped[str]= mapped_column(String(60), nullable=False)
    model: Mapped[str]= mapped_column(String(80), nullable=False)
    year: Mapped[int]= mapped_column(Integer, nullable=False)

    plate: Mapped[Optional[str]]= mapped_column(String(7), nullable=True, unique=True)
    chassi: Mapped[str]= mapped_column(String(30), nullable=False, unique=True)
    km: Mapped[Optional[int]]= mapped_column(Integer, nullable=True)
    color: Mapped[str]= mapped_column(String(30), nullable=False)

    cost_price: Mapped[Decimal]= mapped_column(Numeric(12, 2), nullable=False, default=0)
    sale_price: Mapped[Decimal]= mapped_column(Numeric(12, 2), nullable=False, default=0)

    status: Mapped[ProductStatus]= mapped_column(
        SAEnum(ProductStatus, name="product_status"),
        nullable=False,
        default=ProductStatus.IN_STOCK,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    sale: Mapped[Optional["SaleORM"]] = relationship(back_populates="product", uselist=False)
    promissories: Mapped[List["PromissoryORM"]] = relationship(back_populates="product")

class SaleORM(Base):
    __tablename__ = "sales"
    __table_args__ = (
        UniqueConstraint("public_id", name="uq_sales_public_id"),
        UniqueConstraint("product_id", name="uq_sales_product_id"), # unica venda por produto
        Index("ix_sales_status", "status"),
        Index("ix_sales_payment_type", "payment_type"),
    )

    id:Mapped[int]=mapped_column(Integer, primary_key=True)

    # ex.: "MOTO-2026-000123"
    public_id:Mapped[str]=mapped_column(String(32), nullable=False)

    client_id:Mapped[int]=mapped_column(ForeignKey("clients.id"), nullable=False)
    user_id:Mapped[int]=mapped_column(ForeignKey("users.id"), nullable=False)
    product_id:Mapped[int]=mapped_column(ForeignKey("products.id"), nullable=False)

    total:Mapped[Decimal]=mapped_column(Numeric(12, 2), nullable=False)
    discount:Mapped[Decimal]=mapped_column(Numeric(12, 2), nullable=False, default=0)
    entry_amount:Mapped[Optional[Decimal]]=mapped_column(Numeric(12, 2), nullable=True)

    payment_type:Mapped[PaymentType]=mapped_column(
        SAEnum(PaymentType, name="payment_type"),
        nullable=False,
        default=PaymentType.CASH,
    )

    status:Mapped[SaleStatus]=mapped_column(
        SAEnum(SaleStatus, name="sale_status"),
        nullable=False,
        default=SaleStatus.DRAFT,
    )

    created_at:Mapped[datetime]=mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # relações
    client:Mapped["ClientORM"]=relationship(back_populates="sales")
    user:Mapped["UserORM"]=relationship(back_populates="sales")
    product:Mapped["ProductORM"]=relationship(back_populates="sale")

    promissory:Mapped[Optional["PromissoryORM"]]=relationship(
        back_populates="sale", uselist=False
    )
    
class PromissoryORM(Base):
    __tablename__ = "promissories"
    __table_args__ = (
        UniqueConstraint("public_id", name="uq_promissories_public_id"),
        UniqueConstraint("sale_id", name="uq_promissories_sale_id"), #0..1 por venda
        Index("ix_promissories_status", "status"),
    )

    id:Mapped[int]=mapped_column(Integer, primary_key=True)

    # ex.: PROM-2026-000123
    public_id:Mapped[str]=mapped_column(String(32), nullable=False)

    sale_id:Mapped[Optional[int]]=mapped_column(ForeignKey("sales.id"), nullable=True)
    client_id:Mapped[int]=mapped_column(ForeignKey("clients.id"), nullable=False)
    product_id:Mapped[Optional[int]]=mapped_column(ForeignKey("products.id"), nullable=True)

    total:Mapped[Decimal]=mapped_column(Numeric(12, 2), nullable=False)
    entry_amount:Mapped[Decimal]=mapped_column(Numeric(12, 2), nullable=False, default=0)

    status:Mapped[PromissoryStatus]=mapped_column(
        SAEnum(PromissoryStatus, name="promissory_status"),
        nullable=False,
        default=PromissoryStatus.DRAFT
    )

    issued_at:Mapped[Optional[datetime]]=mapped_column(DateTime(timezone=True), nullable=True)

    # snapshot *opcional
    snapshot_json:Mapped[Optional[str]]=mapped_column(Text, nullable=True)

    created_at:Mapped[datetime]=mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # relações
    sale:Mapped[Optional["SaleORM"]]=relationship(back_populates="promissory")
    client:Mapped["ClientORM"]=relationship(back_populates="promissories")
    product:Mapped[Optional["ProductORM"]]=relationship(back_populates="promissories")

    installments:Mapped[List["InstallmentORM"]]=relationship(
        back_populates="promissory", cascade="all, delete-orphan"
    )

class InstallmentORM(Base):
    __tablename__ = "installments"
    __table_args__ = (
        UniqueConstraint("promissory_id", "number", name="uq_installments_promissory_number"),
        Index("ix_installments_due", "due_date", "status"),
        Index("ix_installments_wpp_due", "wa_due_status", "wa_due_next_retry_at"),
        Index("ix_installments_wpp_overdue", "wa_overdue_status", "wa_overdue_next_retry_at"),
    )

    id:Mapped[int]=mapped_column(Integer, primary_key=True)

    promissory_id:Mapped[int]=mapped_column(ForeignKey("promissories.id"), nullable=False)

    number:Mapped[int]=mapped_column(Integer, nullable=False) #1..N
    due_date:Mapped[date]=mapped_column(Date, nullable=False)
    amount:Mapped[Decimal]=mapped_column(Numeric(12, 2), nullable=False)

    status:Mapped[InstallmentStatus]=mapped_column(
        SAEnum(InstallmentStatus, name="installment_status"),
        nullable=False,
        default=InstallmentStatus.PENDING
    )

    paid_at:Mapped[Optional[datetime]]=mapped_column(DateTime(timezone=True), nullable=True)
    paid_amount:Mapped[Optional[Decimal]]=mapped_column(Numeric(12, 2), nullable=True)
    note:Mapped[Optional[str]]=mapped_column(Text, nullable=True)

    # lembrete whatsapp "vence em breve..."
    wa_due_status:Mapped[WppSendStatus]=mapped_column(
        SAEnum(WppSendStatus, name="wpp_installment_due_status"),
        nullable=False,
        default=WppSendStatus.PENDING,
    )
    wa_due_tries:Mapped[int]=mapped_column(Integer, nullable=False, default=0)
    wa_due_last_error:Mapped[Optional[str]]=mapped_column(Text, nullable=True)
    wa_due_sent_at:Mapped[Optional[datetime]]=mapped_column(DateTime(timezone=True), nullable=True)
    wa_due_next_retry_at:Mapped[Optional[datetime]]=mapped_column(DateTime(timezone=True), nullable=True)

    # cobrança quando tiver vencida
    wa_overdue_status:Mapped[WppSendStatus]=mapped_column(
        SAEnum(WppSendStatus, name="wpp_installment_overdue_status"),
        nullable=False,
        default=WppSendStatus.PENDING,
    )
    wa_overdue_tries:Mapped[int]=mapped_column(Integer, nullable=False, default=0)
    wa_overdue_last_error:Mapped[Optional[str]]=mapped_column(Text, nullable=True)
    wa_overdue_sent_at:Mapped[Optional[datetime]]=mapped_column(DateTime(timezone=True), nullable=True)
    wa_overdue_next_retry_at:Mapped[Optional[datetime]]=mapped_column(DateTime(timezone=True), nullable=True)

    created_at:Mapped[datetime]=mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    promissory:Mapped["PromissoryORM"]=relationship(back_populates="installments")

class FinanceORM(Base):
    __tablename__ = "finance"
    __table_args__ = (
        Index("ix_finance_due_status", "due_date", "status"),
        Index("ix_finance_wpp", "wpp_status", "wpp_next_retry_at"),
    )

    id:Mapped[int]=mapped_column(Integer, primary_key=True)

    company:Mapped[str]=mapped_column(String(120), nullable=False)
    amount:Mapped[Decimal]=mapped_column(Numeric(12, 2), nullable=False)
    due_date:Mapped[date]=mapped_column(Date, nullable=False)

    status:Mapped[FinanceStatus]=mapped_column(
        SAEnum(FinanceStatus, name="finance_status"),
        nullable=False,
        default=FinanceStatus.PENDING,
    )

    # controle do envio no whatsapp
    wpp_status:Mapped[WppSendStatus]=mapped_column(
        SAEnum(WppSendStatus, name="wpp_finance_status"),
        nullable=False,
        default=WppSendStatus.PENDING,
    )
    wpp_tries:Mapped[int]=mapped_column(Integer, nullable=False, default=0)
    wpp_last_error:Mapped[Optional[str]]=mapped_column(Text, nullable=True)
    wpp_sent_at:Mapped[Optional[datetime]]=mapped_column(DateTime(timezone=True), nullable=True)
    wpp_next_retry_at:Mapped[Optional[datetime]]=mapped_column(DateTime(timezone=True), nullable=True)

    description:Mapped[Optional[str]]=mapped_column(String(200), nullable=True)
    notes:Mapped[Optional[str]]=mapped_column(Text, nullable=True)

    created_at:Mapped[datetime]=mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )