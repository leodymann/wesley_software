from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import DBSession
from app.infra.models import FinanceORM, FinanceStatus, WppSendStatus
from app.schemas.finance import FinanceCreate, FinanceUpdate, FinancePay, FinanceOut

router = APIRouter()


@router.post("", response_model=FinanceOut, status_code=201)
def create_finance(payload: FinanceCreate, db: Session = DBSession):
    try:
        status = FinanceStatus(payload.status)
    except Exception:
        raise HTTPException(status_code=400, detail="status inválido (PENDING|PAID|CANCELED).")

    row = FinanceORM(
        company=payload.company.strip(),
        amount=payload.amount,
        due_date=payload.due_date,
        status=status,
        description=payload.description,
        notes=payload.notes,
        wpp_status=WppSendStatus.PENDING,
        wpp_tries=0,
        wpp_last_error=None,
        wpp_sent_at=None,
        wpp_next_retry_at=None,
    )
    db.add(row)
    db.flush()
    return row


@router.get("", response_model=list[FinanceOut])
def list_finance(
    db: Session = DBSession,
    status: Optional[str] = Query(default=None, description="PENDING|PAID|CANCELED"),
    company: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    stmt = select(FinanceORM).order_by(FinanceORM.due_date.asc(), FinanceORM.id.asc())

    if status:
        try:
            st = FinanceStatus(status)
        except Exception:
            raise HTTPException(status_code=400, detail="status inválido (PENDING|PAID|CANCELED).")
        stmt = stmt.where(FinanceORM.status == st)

    if company:
        stmt = stmt.where(FinanceORM.company.ilike(f"%{company}%"))

    stmt = stmt.limit(limit).offset(offset)
    return db.execute(stmt).scalars().all()


@router.get("/{finance_id}", response_model=FinanceOut)
def get_finance(finance_id: int, db: Session = DBSession):
    row = db.get(FinanceORM, finance_id)
    if not row:
        raise HTTPException(status_code=404, detail="Finance não encontrado.")
    return row


@router.put("/{finance_id}", response_model=FinanceOut)
def update_finance(finance_id: int, payload: FinanceUpdate, db: Session = DBSession):
    row = db.get(FinanceORM, finance_id)
    if not row:
        raise HTTPException(status_code=404, detail="Finance não encontrado.")

    if payload.company is not None:
        row.company = payload.company.strip()
    if payload.amount is not None:
        row.amount = payload.amount
    if payload.due_date is not None:
        row.due_date = payload.due_date
    if payload.description is not None:
        row.description = payload.description
    if payload.notes is not None:
        row.notes = payload.notes

    if payload.status is not None:
        try:
            row.status = FinanceStatus(payload.status)
        except Exception:
            raise HTTPException(status_code=400, detail="status inválido (PENDING|PAID|CANCELED).")

    db.flush()
    return row


@router.post("/{finance_id}/pay", response_model=FinanceOut)
def pay_finance(finance_id: int, payload: FinancePay, db: Session = DBSession):
    row = db.get(FinanceORM, finance_id)
    if not row:
        raise HTTPException(status_code=404, detail="Finance não encontrado.")

    # marca como pago
    row.status = FinanceStatus.PAID

    row.wpp_status = WppSendStatus.SENT
    row.wpp_sent_at = payload.paid_at or datetime.utcnow()
    row.wpp_next_retry_at = None
    row.wpp_last_error = None

    db.flush()
    return row
