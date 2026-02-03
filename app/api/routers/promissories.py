from __future__ import annotations
from fastapi import APIRouter, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import select
from typing import Optional

from app.api.deps import DBSession
from app.infra.models import PromissoryORM, PromissoryStatus
from app.schemas.promissories import PromissoryOut
from app.services.sales_service import issue_promissory, cancel_promissory

router = APIRouter()

@router.get("", response_model=list[PromissoryOut])
def list_promissories(
    db: Session = DBSession,
    status: Optional[str] = Query(default=None, description="DRAFT|ISSUED|CANCELED|PAID"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    stmt = select(PromissoryORM).order_by(PromissoryORM.id.desc())
    if status:
        try:
            st = PromissoryStatus(status)
        except Exception:
            raise HTTPException(status_code=400, detail="Status inválido.")
        stmt = stmt.where(PromissoryORM.status == st)
    stmt = stmt.limit(limit).offset(offset)
    return db.execute(stmt).scalars().all()

@router.get("/{prom_id}", response_model=PromissoryOut)
def get_promissory(prom_id: int, db: Session = DBSession):
    prom = db.get(PromissoryORM, prom_id)
    if not prom:
        raise HTTPException(status_code=404, detail="Promissória não encontrada.")
    return prom

@router.post("/{prom_id}/issue", response_model=PromissoryOut)
def issue(prom_id: int, db: Session = DBSession):
    try:
        prom = issue_promissory(db, prom_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return prom

@router.patch("/promissories/{prom_id}/cancel", response_model=PromissoryOut)
def cancel_promissory_endpoint(prom_id: int, db: Session = DBSession):
    try:
        prom = cancel_promissory(db, prom_id)
        return PromissoryOut.model_validate(prom)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
