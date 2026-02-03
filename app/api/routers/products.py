from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import select
from typing import Optional

from app.api.deps import DBSession
from app.infra.models import ProductORM, ProductStatus
from app.schemas.products import ProductCreate, ProductUpdate, ProductOut

router = APIRouter()


def normalize_plate(plate: str) -> str:
    return plate.strip().upper().replace("-", "").replace(" ", "")


def normalize_chassi(chassi: str) -> str:
    return chassi.strip().upper().replace(" ", "")


@router.post("", response_model=ProductOut, status_code=201)
def create_product(payload: ProductCreate, db: Session = DBSession):
    plate = normalize_plate(payload.plate) if payload.plate else None
    chassi = normalize_chassi(payload.chassi)

    # valida o chassi enviado
    exists_chassi = db.scalar(select(ProductORM.id).where(ProductORM.chassi == chassi))
    if exists_chassi:
        raise HTTPException(status_code=409, detail="Chassi já cadastrado.")


    if plate:
        exists_plate = db.scalar(select(ProductORM.id).where(ProductORM.plate == plate))
        if exists_plate:
            raise HTTPException(status_code=409, detail="Placa já cadastrada.")

    status = ProductStatus.IN_STOCK
    if payload.status:
        try:
            status = ProductStatus(payload.status)
        except Exception:
            raise HTTPException(status_code=400, detail="Status de produto inválido.")

    product = ProductORM(
        brand=payload.brand.strip(),
        model=payload.model.strip(),
        year=payload.year,
        plate=plate,
        chassi=chassi,
        km=payload.km,
        color=payload.color.strip(),
        cost_price=payload.cost_price,
        sale_price=payload.sale_price,
        status=status,
    )
    db.add(product)
    db.flush()
    return product


@router.get("", response_model=list[ProductOut])
def list_products(
    db: Session = DBSession,
    q: Optional[str] = Query(default=None, description="Busca por marca/modelo/placa/chassi"),
    status: Optional[str] = Query(default=None, description="IN_STOCK|RESERVED|SOLD"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    stmt = select(ProductORM).order_by(ProductORM.id.desc())

    if status:
        try:
            st = ProductStatus(status)
        except Exception:
            raise HTTPException(status_code=400, detail="Status inválido.")
        stmt = stmt.where(ProductORM.status == st)

    if q:
        qn = q.strip()
        qp = normalize_plate(qn)
        qc = normalize_chassi(qn)

        stmt = stmt.where(
            (ProductORM.brand.ilike(f"%{qn}%")) |
            (ProductORM.model.ilike(f"%{qn}%")) |
            (ProductORM.plate.ilike(f"%{qp}%")) |
            (ProductORM.chassi.ilike(f"%{qc}%"))
        )

    stmt = stmt.limit(limit).offset(offset)
    products = db.execute(stmt).scalars().all()
    return products


@router.get("/{product_id}", response_model=ProductOut)
def get_product(product_id: int, db: Session = DBSession):
    product = db.get(ProductORM, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")
    return product


@router.put("/{product_id}", response_model=ProductOut)
def update_product(product_id: int, payload: ProductUpdate, db: Session = DBSession):
    product = db.get(ProductORM, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")

    if payload.plate is not None:
        plate = normalize_plate(payload.plate) if payload.plate else None
        if plate:
            exists_plate = db.scalar(
                select(ProductORM.id).where(ProductORM.plate == plate, ProductORM.id != product_id)
            )
            if exists_plate:
                raise HTTPException(status_code=409, detail="Placa já cadastrada.")
        product.plate = plate

    if payload.chassi is not None:
        chassi = normalize_chassi(payload.chassi)
        exists_chassi = db.scalar(
            select(ProductORM.id).where(ProductORM.chassi == chassi, ProductORM.id != product_id)
        )
        if exists_chassi:
            raise HTTPException(status_code=409, detail="Chassi já cadastrado.")
        product.chassi = chassi

    if payload.brand is not None:
        product.brand = payload.brand.strip()
    if payload.model is not None:
        product.model = payload.model.strip()
    if payload.year is not None:
        product.year = payload.year
    if payload.km is not None:
        product.km = payload.km
    if payload.color is not None:
        product.color = payload.color.strip()
    if payload.cost_price is not None:
        product.cost_price = payload.cost_price
    if payload.sale_price is not None:
        product.sale_price = payload.sale_price

    if payload.status is not None:
        try:
            product.status = ProductStatus(payload.status)
        except Exception:
            raise HTTPException(status_code=400, detail="Status de produto inválido.")

    db.flush()
    return product
