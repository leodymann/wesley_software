from __future__ import annotations
from pydantic import BaseModel, ConfigDict
from typing import Optional
from decimal import Decimal
from datetime import datetime
from app.infra.models import PromissoryStatus

class PromissoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    public_id: str
    status: str
    total: Decimal
    entry_amount: Decimal
    issued_at: Optional[datetime]
    client_id: int
    product_id: Optional[int]
    sale_id: Optional[int]

from pydantic import BaseModel, field_validator
from infra.models import PromissoryStatus

class PromissoryStatusUpdate(BaseModel):
    status: PromissoryStatus

    # opcional: aceitar canceled
    @field_validator("status", mode="before")
    @classmethod
    def normalize(cls, v):
        if isinstance(v, str):
            return v.lower()
        return v
