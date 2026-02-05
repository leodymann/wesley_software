from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, UploadFile, File, Form, Depends
from sqlalchemy.orm import Session
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from api.deps import DBSession
from api.auth_deps import get_current_user

from infra.models import ProductORM, ProductStatus, ProductImageORM
from schemas.products import ProductUpdate, ProductOut

from infra.storage import (
    put_bytes,
    delete_object,
    presign_get_url,
    make_image_key,
    random_filename,
)

router = APIRouter(dependencies=[Depends(get_current_user)])

ALLOWED_CT = {"image/jpeg", "image/png", "image/webp"}


def normalize_plate(plate: str) -> str:
    return plate.strip().upper().replace("-", "").replace(" ", "")


def normalize_chassi(chassi: str) -> str:
    return chassi.strip().upper().replace(" ", "")


def _safe_ext(upload: UploadFile) -> str:
    ct = (upload.content_type or "").lower()
    if ct == "image/jpeg":
        return ".jpg"
    if ct == "image/png":
        return ".png"
    if ct == "image/webp":
        return ".webp"
    return ""


def _presign_images(product: ProductORM, expires_seconds: int) -> None:
    """
    product.images[].url no DB guarda a KEY (ex: "products/12/abc.jpg").
    Aqui convertemos para URL assinada na resposta, sem salvar no DB.
    """
    if not getattr(product, "images", None):
        return
    for im in product.images:
        ref = (im.url or "").strip()
        if not ref:
            continue
        # se já for http(s), mantém (compatibilidade)
        if ref.startswith("http://") or ref.startswith("https://"):
            continue
        im.url = presign_get_url(ref, expires_seconds=expires_seconds)


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

    expires = int((__import__("os").getenv("S3_PRESIGN_EXPIRES_SECONDS", "3600")))
    _presign_images(product, expires_seconds=expires)
    return product


@router.put("/{product_id}", response_model=ProductOut)
def update_product(product_id: int, payload: ProductUpdate, db: Session = DBSession):
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

    stmt2 = (
        select(ProductORM)
        .options(selectinload(ProductORM.images))
        .where(ProductORM.id == product_id)
    )
    updated = db.execute(stmt2).scalars().one()

    expires = int((__import__("os").getenv("S3_PRESIGN_EXPIRES_SECONDS", "3600")))
    _presign_images(updated, expires_seconds=expires)
    return updated


@router.post("", response_model=ProductOut, status_code=201)
def create_product(
    db: Session = DBSession,
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

    uploaded_keys: list[str] = []

    try:
        # ✅ upload bucket + salva KEY no DB
        for idx, img in enumerate(images, start=1):
            ext = _safe_ext(img)
            if not ext:
                raise HTTPException(status_code=415, detail="Extensão inválida para imagem.")

            filename = random_filename(ext)
            key = make_image_key(product.id, filename)

            content = img.file.read()
            if not content:
                raise HTTPException(status_code=422, detail="Arquivo de imagem vazio.")

            stored_key = put_bytes(
                content=content,
                content_type=(img.content_type or "application/octet-stream"),
                key=key,
            )
            uploaded_keys.append(stored_key)

            db.add(ProductImageORM(
                product_id=product.id,
                url=stored_key,   # ✅ DB guarda KEY
                position=idx,
            ))

        db.flush()

        stmt = (
            select(ProductORM)
            .options(selectinload(ProductORM.images))
            .where(ProductORM.id == product.id)
        )
        created = db.execute(stmt).scalars().one()

        expires = int((__import__("os").getenv("S3_PRESIGN_EXPIRES_SECONDS", "3600")))
        _presign_images(created, expires_seconds=expires)
        return created

    except HTTPException:
        db.rollback()
        # limpa objetos já enviados ao bucket
        for k in uploaded_keys:
            try:
                delete_object(k)
            except Exception:
                pass
        raise

    except Exception:
        db.rollback()
        for k in uploaded_keys:
            try:
                delete_object(k)
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
        .options(selectinload(ProductORM.images))
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

    expires = int((__import__("os").getenv("S3_PRESIGN_EXPIRES_SECONDS", "3600")))
    for p in products:
        _presign_images(p, expires_seconds=expires)

    return products
