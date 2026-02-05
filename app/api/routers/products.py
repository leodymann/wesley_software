from __future__ import annotations

import os
import uuid
import shutil
from pathlib import Path
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from api.deps import DBSession
from infra.models import ProductORM, ProductStatus, ProductImageORM
from schemas.products import ProductUpdate, ProductOut

from fastapi import Depends
from api.auth_deps import get_current_user

router = APIRouter(dependencies=[Depends(get_current_user)])

UPLOAD_ROOT = Path("uploads")  # pasta local
PRODUCTS_DIR = UPLOAD_ROOT / "products"
ALLOWED_CT = {"image/jpeg", "image/png", "image/webp"}


def normalize_plate(plate: str) -> str:
    return plate.strip().upper().replace("-", "").replace(" ", "")


def normalize_chassi(chassi: str) -> str:
    return chassi.strip().upper().replace(" ", "")


def _safe_ext(upload: UploadFile) -> str:
    # tenta inferir extensão de forma simples
    ct = (upload.content_type or "").lower()
    if ct == "image/jpeg":
        return ".jpg"
    if ct == "image/png":
        return ".png"
    if ct == "image/webp":
        return ".webp"
    return ""


def _save_uploadfile_to_path(upload: UploadFile, dst_path: Path) -> None:
    dst_path.parent.mkdir(parents=True, exist_ok=True)
    with dst_path.open("wb") as buffer:
        shutil.copyfileobj(upload.file, buffer)

@router.get("/{product_id}", response_model=ProductOut)
def get_product(product_id: int, db: Session = DBSession):
    stmt = (
        select(ProductORM)
        .options(selectinload(ProductORM.images))
        .where(ProductORM.id == product_id)
    )
    product = db.execute(stmt).scalars().first()

    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")
    return product
@router.put("/{product_id}", response_model=ProductOut)
def update_product(product_id: int, payload: ProductUpdate, db: Session = DBSession):
    # carrega o produto + imagens para já devolver completo
    stmt = (
        select(ProductORM)
        .options(selectinload(ProductORM.images))
        .where(ProductORM.id == product_id)
    )
    product = db.execute(stmt).scalars().first()

    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")

    # placa
    if payload.plate is not None:
        plate = normalize_plate(payload.plate) if payload.plate else None
        if plate:
            exists_plate = db.scalar(
                select(ProductORM.id).where(
                    ProductORM.plate == plate,
                    ProductORM.id != product_id
                )
            )
            if exists_plate:
                raise HTTPException(status_code=409, detail="Placa já cadastrada.")
        product.plate = plate

    # chassi
    if payload.chassi is not None:
        chassi = normalize_chassi(payload.chassi)
        exists_chassi = db.scalar(
            select(ProductORM.id).where(
                ProductORM.chassi == chassi,
                ProductORM.id != product_id
            )
        )
        if exists_chassi:
            raise HTTPException(status_code=409, detail="Chassi já cadastrado.")
        product.chassi = chassi

    # campos simples
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

    # status
    if payload.status is not None:
        try:
            product.status = ProductStatus(payload.status)
        except Exception:
            raise HTTPException(status_code=400, detail="Status de produto inválido.")

    db.flush()

    # garante retorno com imagens carregadas (mesmo após flush)
    stmt2 = (
        select(ProductORM)
        .options(selectinload(ProductORM.images))
        .where(ProductORM.id == product_id)
    )
    updated = db.execute(stmt2).scalars().one()
    return updated

@router.post("", response_model=ProductOut, status_code=201)
def create_product(
    db: Session = DBSession,
    # campos (multipart)
    brand: str = Form(..., min_length=2, max_length=60),
    model: str = Form(..., min_length=1, max_length=80),
    year: int = Form(..., ge=1900, le=2100),
    plate: Optional[str] = Form(default=None),
    chassi: str = Form(..., min_length=5, max_length=30),
    km: Optional[int] = Form(default=None, ge=0),
    color: str = Form(..., min_length=1, max_length=30),
    cost_price: Decimal = Form(default=Decimal("0.00")),
    sale_price: Decimal = Form(default=Decimal("0.00")),
    status: Optional[str] = Form(default=None),
    # ✅ imagens: 2–4
    images: list[UploadFile] = File(..., description="Envie de 2 a 4 imagens"),
):
    # valida quantidade
    if not (2 <= len(images) <= 4):
        raise HTTPException(status_code=422, detail="Envie entre 2 e 4 imagens.")

    # valida content-type
    for img in images:
        if (img.content_type or "").lower() not in ALLOWED_CT:
            raise HTTPException(
                status_code=415,
                detail=f"Tipo de arquivo não suportado: {img.content_type}. Use jpeg/png/webp.",
            )

    plate_n = normalize_plate(plate) if plate else None
    chassi_n = normalize_chassi(chassi)

    # valida chassi
    exists_chassi = db.scalar(select(ProductORM.id).where(ProductORM.chassi == chassi_n))
    if exists_chassi:
        raise HTTPException(status_code=409, detail="Chassi já cadastrado.")

    # valida placa
    if plate_n:
        exists_plate = db.scalar(select(ProductORM.id).where(ProductORM.plate == plate_n))
        if exists_plate:
            raise HTTPException(status_code=409, detail="Placa já cadastrada.")

    # status
    st = ProductStatus.IN_STOCK
    if status:
        try:
            st = ProductStatus(status)
        except Exception:
            raise HTTPException(status_code=400, detail="Status de produto inválido.")

    # cria produto
    product = ProductORM(
        brand=brand.strip(),
        model=model.strip(),
        year=year,
        plate=plate_n,
        chassi=chassi_n,
        km=km,
        color=color.strip(),
        cost_price=cost_price,
        sale_price=sale_price,
        status=st,
    )
    db.add(product)
    db.flush()  # garante product.id

    saved_paths: list[Path] = []
    try:
        # salva imagens e cria registros
        for idx, img in enumerate(images, start=1):
            ext = _safe_ext(img)
            if not ext:
                raise HTTPException(status_code=415, detail="Extensão inválida para imagem.")

            filename = f"{uuid.uuid4().hex}{ext}"
            disk_path = PRODUCTS_DIR / str(product.id) / filename
            _save_uploadfile_to_path(img, disk_path)
            saved_paths.append(disk_path)

            url = f"/static/products/{product.id}/{filename}"

            db.add(ProductImageORM(
                product_id=product.id,
                url=url,
                position=idx,
            ))

        db.flush()

        # retorna com images carregadas
        stmt = (
            select(ProductORM)
            .options(selectinload(ProductORM.images))
            .where(ProductORM.id == product.id)
        )
        created = db.execute(stmt).scalars().one()
        return created

    except HTTPException:
        db.rollback()
        # limpa arquivos já salvos
        for p in saved_paths:
            try:
                p.unlink(missing_ok=True)
            except Exception:
                pass
        # tenta remover pasta do produto se ficar vazia
        try:
            (PRODUCTS_DIR / str(product.id)).rmdir()
        except Exception:
            pass
        raise

    except Exception:
        db.rollback()
        for p in saved_paths:
            try:
                p.unlink(missing_ok=True)
            except Exception:
                pass
        try:
            (PRODUCTS_DIR / str(product.id)).rmdir()
        except Exception:
            pass
        raise HTTPException(status_code=500, detail="Erro ao salvar produto/imagens.")

@router.get("", response_model=list[ProductOut])
def list_products(
    db: Session = DBSession,
    q: Optional[str] = Query(default=None, description="Busca por marca/modelo/placa/chassi"),
    status: Optional[str] = Query(default=None, description="IN_STOCK|RESERVED|SOLD"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    stmt = (
        select(ProductORM)
        .options(selectinload(ProductORM.images))   # ✅ carrega imagens
        .order_by(ProductORM.id.desc())
    )

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
