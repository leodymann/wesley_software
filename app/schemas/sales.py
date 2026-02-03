from __future__ import annotations
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from decimal import Decimal
from datetime import date
from app.infra.models import SaleStatus
class SaleCreate(BaseModel):
    client_id: int
    user_id: int
    product_id: int

    total: Decimal = Field(gt=0)
    discount: Decimal = Field(default=Decimal("0.00"), ge=0)
    entry_amount: Optional[Decimal] = Field(default=None, ge=0)

    payment_type: str  # cash, pix, card e promissory

    installments_count: Optional[int] = Field(default=None, ge=1, le=60)
    first_due_date: Optional[date] = None

class SaleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    public_id: str
    status: str
    payment_type: str
    total: Decimal
    discount: Decimal
    entry_amount: Optional[Decimal]

class SaleStatusUpdate(BaseModel):
    status: SaleStatus