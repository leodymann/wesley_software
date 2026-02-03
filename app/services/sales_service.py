# app/services/sales_service.py
from __future__ import annotations

from datetime import datetime, date
from decimal import Decimal
from typing import Optional, Tuple

from sqlalchemy import select, func
from sqlalchemy.orm import Session
from dateutil.relativedelta import relativedelta
from app.infra.models import SaleORM, SaleStatus

from app.infra.models import (
    SaleORM,
    ProductORM,
    ClientORM,
    UserORM,
    PromissoryORM,
    InstallmentORM,
    ProductStatus,
    SaleStatus,
    PaymentType,
    PromissoryStatus,
    InstallmentStatus,
)
from app.services.id_gen import generate_public_id



# helpers
def _today_utc() -> date:
    # UTC.
    return datetime.utcnow().date()


def _add_months(d: date, months: int) -> date:
    # resolve fim de mês corretamente (ex.: 30/01 + 1 mês -> 28/02)
    return d + relativedelta(months=months)


def _unique_public_id(db: Session, model, prefix: str) -> str:
    for _ in range(30):
        pid = generate_public_id(prefix)
        exists = db.scalar(select(model.id).where(model.public_id == pid))
        if not exists:
            return pid
    raise RuntimeError(f"Falha ao gerar public_id único para prefix={prefix}.")


def _quantize_money(v: Decimal) -> Decimal:
    return v.quantize(Decimal("0.01"))


# use cases - services
ALLOWED_TRANSITIONS: dict[SaleStatus, set[SaleStatus]] = {
    SaleStatus.DRAFT: {SaleStatus.CONFIRMED, SaleStatus.CANCELED},
    SaleStatus.CONFIRMED: set(),  # ou permitir canceled
    SaleStatus.CANCELED: set(),
}


def update_sale_status(db: Session, *, sale_id: int, new_status: SaleStatus) -> SaleORM:
    sale = db.query(SaleORM).filter(SaleORM.id == sale_id).first()
    if not sale:
        raise ValueError("Venda não encontrada")

    current = sale.status

    # idempotência: se já está no status, só retorna
    if current == new_status:
        return sale

    allowed = ALLOWED_TRANSITIONS.get(current, set())
    if new_status not in allowed:
        raise ValueError(f"Transição inválida: {current} -> {new_status}")

    sale.status = new_status
    db.add(sale)
    db.commit()
    db.refresh(sale)

    return sale

def create_sale(
    db: Session,
    *,
    client_id: int,
    user_id: int,
    product_id: int,
    total: Decimal,
    discount: Decimal = Decimal("0.00"),
    entry_amount: Optional[Decimal] = None,
    payment_type: PaymentType,
    installments_count: Optional[int] = None,
    # se vier, override do primeiro vencimento; se não vier, será 1 mês após a venda
    first_due_date: Optional[date] = None,
) -> Tuple[SaleORM, Optional[PromissoryORM]]:
    """
    cria venda confirmed.
    se payment_type == promissory, cria promissória draft + parcelas (1ª parcela 1 mês após a venda por padrão).
    rules:
      - produto precisa estar in_stock
      - marca produto como sold
      - entrada não pode ser maior que total
      - parcelas geradas a partir do first_due_date (override) ou 1 mês após a venda
    """

    # validações de FK
    if not db.get(ClientORM, client_id):
        raise ValueError("client_id inválido.")
    if not db.get(UserORM, user_id):
        raise ValueError("user_id inválido.")

    product = db.get(ProductORM, product_id)
    if not product:
        raise ValueError("product_id inválido.")
    if product.status != ProductStatus.IN_STOCK:
        raise ValueError("Produto não está disponível (precisa estar IN_STOCK).")

    total = _quantize_money(Decimal(total))
    discount = _quantize_money(Decimal(discount))
    entry_amount = _quantize_money(Decimal(entry_amount)) if entry_amount is not None else None

    if total <= 0:
        raise ValueError("total deve ser maior que zero.")
    if discount < 0:
        raise ValueError("discount não pode ser negativo.")
    if entry_amount is not None and entry_amount < 0:
        raise ValueError("entry_amount não pode ser negativo.")

    # public_id da venda
    sale_public_id = _unique_public_id(db, SaleORM, "VEN")

    sale = SaleORM(
        public_id=sale_public_id,
        client_id=client_id,
        user_id=user_id,
        product_id=product_id,
        total=total,
        discount=discount,
        entry_amount=entry_amount,
        payment_type=payment_type,
        status=SaleStatus.DRAFT,
    )
    db.add(sale)

    # marca produto como vendido
    product.status = ProductStatus.SOLD

    promissory: Optional[PromissoryORM] = None

    # promissória + parcelas
    if payment_type == PaymentType.PROMISSORY:
        if not installments_count or installments_count < 1:
            raise ValueError("Para PROMISSORY informe installments_count (>= 1).")

        entry = entry_amount or Decimal("0.00")
        remaining = _quantize_money(total - entry)
        if remaining < 0:
            raise ValueError("Entrada maior que o total.")

        prom_public_id = _unique_public_id(db, PromissoryORM, "PROM")

        promissory = PromissoryORM(
            public_id=prom_public_id,
            sale=sale,
            client_id=client_id,
            product_id=product_id,
            total=total,
            entry_amount=_quantize_money(entry),
            status=PromissoryStatus.DRAFT,
        )
        db.add(promissory)

        # 1° parcela: 1 mês após a venda
        sale_day = _today_utc()
        first_due = first_due_date or _add_months(sale_day, 1)

        # valor por parcela
        per = _quantize_money(remaining / Decimal(installments_count))
        total_calc = per * Decimal(installments_count)
        diff = _quantize_money(remaining - total_calc)  # pode ser negativo/positivo por arredondamento

        for n in range(1, installments_count + 1):
            due = _add_months(first_due, n - 1)
            amount = per
            # joga o ajuste de arredondamento na última parcela
            if n == installments_count and diff != 0:
                amount = _quantize_money(amount + diff)

            inst = InstallmentORM(
                promissory=promissory,
                number=n,
                due_date=due,
                amount=amount,
                status=InstallmentStatus.PENDING,
            )
            db.add(inst)

    db.flush()
    return sale, promissory

def list_sales(
    db: Session,
    *,
    page: int = 1,
    page_size: int = 20,
    client_id: Optional[int] = None,
    user_id: Optional[int] = None,
    product_id: Optional[int] = None,
    payment_type: Optional[PaymentType] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
):
    if page < 1:
        raise ValueError("page deve ser >= 1")
    if page_size < 1 or page_size > 200:
        raise ValueError("page_size deve estar entre 1 e 200")

    q = db.query(SaleORM)

    # filtros
    if client_id is not None:
        q = q.filter(SaleORM.client_id == client_id)

    if user_id is not None:
        q = q.filter(SaleORM.user_id == user_id)

    if product_id is not None:
        q = q.filter(SaleORM.product_id == product_id)

    if payment_type is not None:
        q = q.filter(SaleORM.payment_type == payment_type)

    # período
    if date_from is not None:
        q = q.filter(SaleORM.created_at >= date_from)

    if date_to is not None:
        q = q.filter(SaleORM.created_at <= date_to)

    # total antes da paginação
    total = q.with_entities(func.count(SaleORM.id)).scalar() or 0

    # ordenação + paginação
    items = (
        q.order_by(SaleORM.created_at.desc())
         .offset((page - 1) * page_size)
         .limit(page_size)
         .all()
    )

    return items, total
def issue_promissory(db: Session, prom_id: int) -> PromissoryORM:
    """
    emite promissória: draft -> issued e seta issued_at.
    """
    prom = db.get(PromissoryORM, prom_id)
    if not prom:
        raise ValueError("Promissória não encontrada.")

    if prom.status == PromissoryStatus.CANCELED:
        raise ValueError("Promissória cancelada não pode ser emitida.")

    if prom.status == PromissoryStatus.ISSUED or prom.status == PromissoryStatus.PAID:
        return prom

    prom.status = PromissoryStatus.ISSUED
    prom.issued_at = datetime.utcnow()
    db.flush()
    return prom

# Promissory status transitions
PROM_ALLOWED_TRANSITIONS: dict[PromissoryStatus, set[PromissoryStatus]] = {
    PromissoryStatus.DRAFT: {PromissoryStatus.CANCELED, PromissoryStatus.ISSUED},
    PromissoryStatus.ISSUED: {PromissoryStatus.CANCELED, PromissoryStatus.PAID},  # PAID normalmente vem do pay_installment
    PromissoryStatus.PAID: set(),
    PromissoryStatus.CANCELED: set(),
}


def cancel_promissory(db: Session, prom_id: int) -> PromissoryORM:
    """
    cancela promissória:
      - draft/issued -> canceled
      - nao permite se já estiver paid
      - nao permite se existir parcela paga
      - cancela todas parcelas pendentes
    """
    prom = db.get(PromissoryORM, prom_id)
    if not prom:
        raise ValueError("Promissória não encontrada.")

    if prom.status == PromissoryStatus.CANCELED:
        return prom  # idempotente

    if prom.status == PromissoryStatus.PAID:
        raise ValueError("Não é possível cancelar uma promissória já paga.")

    # rule: não cancelar se já tem parcela paga
    has_paid = any(i.status == InstallmentStatus.PAID for i in prom.installments)
    if has_paid:
        raise ValueError("Não é possível cancelar: existe(m) parcela(s) já paga(s).")

    # rule: transição (segurança extra)
    allowed = PROM_ALLOWED_TRANSITIONS.get(prom.status, set())
    if PromissoryStatus.CANCELED not in allowed:
        raise ValueError(f"Transição inválida: {prom.status} -> {PromissoryStatus.CANCELED}")

    prom.status = PromissoryStatus.CANCELED

    # cancela parcelas que ainda não foram pagas
    for inst in prom.installments:
        if inst.status == InstallmentStatus.PENDING:
            inst.status = InstallmentStatus.CANCELED

    db.flush()
    return prom



def pay_installment(
    db: Session,
    inst_id: int,
    *,
    paid_amount: Optional[Decimal] = None,
) -> InstallmentORM:
    """
    baixa uma parcela:
      - pending -> paid
      - seta paid_at e paid_amount
      - se todas as parcelas estiverem PAID, marca promissória como PAID
    """
    inst = db.get(InstallmentORM, inst_id)
    if not inst:
        raise ValueError("Parcela não encontrada.")

    prom = inst.promissory
    if prom.status == PromissoryStatus.CANCELED:
        raise ValueError("Promissória cancelada: não é possível pagar parcelas.")

    if inst.status == InstallmentStatus.CANCELED:
        raise ValueError("Parcela cancelada não pode ser paga.")
    if inst.status == InstallmentStatus.PAID:
        # idempotente: retorna sem erro
        return inst

    amount_to_pay = Decimal(paid_amount) if paid_amount is not None else inst.amount
    amount_to_pay = _quantize_money(amount_to_pay)
    if amount_to_pay < 0:
        raise ValueError("paid_amount não pode ser negativo.")

    inst.status = InstallmentStatus.PAID
    inst.paid_at = datetime.utcnow()
    inst.paid_amount = amount_to_pay

    db.flush()

    # se todas pagas -> promissória paga
    if all(i.status == InstallmentStatus.PAID for i in prom.installments):
        prom.status = PromissoryStatus.PAID
        db.flush()

    return inst
