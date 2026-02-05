# app/worker.py
from __future__ import annotations

import os
import time
import io
import base64
from datetime import datetime, timedelta, timezone, date
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from PIL import Image
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session, selectinload

from infra.db import SessionLocal
from infra.models import (
    FinanceORM,
    FinanceStatus,
    InstallmentORM,
    InstallmentStatus,
    PromissoryORM,
    SaleORM,
    WppSendStatus,
    ProductORM,
    ProductStatus,
)
from integrations.blibsend import (
    BlibsendError,
    send_whatsapp_text,
    send_whatsapp_group_file_datauri,
)

# carrega .env quando rodar como script
load_dotenv()

UPLOAD_ROOT = Path("uploads")

STATE_DIR = Path(".worker_state")
STATE_DIR.mkdir(exist_ok=True)
OFFERS_SENT_FILE = STATE_DIR / "offers_sent_date.txt"


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def today_local_date() -> date:
    return datetime.now().date()


def already_sent_offers_today() -> bool:
    today = today_local_date().isoformat()
    if not OFFERS_SENT_FILE.exists():
        return False
    return OFFERS_SENT_FILE.read_text(encoding="utf-8").strip() == today


def mark_offers_sent_today() -> None:
    OFFERS_SENT_FILE.write_text(today_local_date().isoformat(), encoding="utf-8")


def compute_backoff_seconds(tries: int) -> int:
    if tries <= 0:
        return 60
    if tries == 1:
        return 5 * 60
    if tries == 2:
        return 15 * 60
    if tries == 3:
        return 60 * 60
    return 6 * 60 * 60


def can_try(status: WppSendStatus, next_retry_at: Optional[datetime]) -> bool:
    if status in (WppSendStatus.SENT, WppSendStatus.SENDING):
        return False
    if next_retry_at is None:
        return True
    return next_retry_at <= now_utc()


def mark_failed_generic(
    *,
    row,
    tries_field: str,
    status_field: str,
    error_field: str,
    next_retry_field: str,
    err: str,
) -> None:
    tries = int(getattr(row, tries_field) or 0) + 1
    setattr(row, tries_field, tries)
    setattr(row, status_field, WppSendStatus.FAILED)
    setattr(row, error_field, err[:500])
    setattr(
        row,
        next_retry_field,
        now_utc() + timedelta(seconds=compute_backoff_seconds(tries)),
    )


def process_finance(db: Session, to_number: str) -> int:
    """
    envia aviso de contas pending com vencimento <= hoje.
    Usa FinanceORM.wpp_* para retry e evitar duplicar.
    """
    today = today_local_date()

    stmt = (
        select(FinanceORM)
        .where(
            and_(
                FinanceORM.status == FinanceStatus.PENDING,
                FinanceORM.due_date <= today,
                FinanceORM.wpp_status != WppSendStatus.SENT,
                or_(
                    FinanceORM.wpp_next_retry_at.is_(None),
                    FinanceORM.wpp_next_retry_at <= now_utc(),
                ),
            )
        )
        .order_by(FinanceORM.due_date.asc(), FinanceORM.id.asc())
        .limit(50)
    )

    rows = db.execute(stmt).scalars().all()
    sent = 0

    for f in rows:
        if not can_try(f.wpp_status, f.wpp_next_retry_at):
            continue

        f.wpp_status = WppSendStatus.SENDING
        db.flush()

        msg = (
            "📌 Conta a pagar vencida/pendente\n"
            f"Empresa: {f.company}\n"
            f"Valor: R$ {f.amount}\n"
            f"Venc.: {f.due_date}\n"
        )

        try:
            send_whatsapp_text(to=to_number, body=msg)
            f.wpp_status = WppSendStatus.SENT
            f.wpp_sent_at = now_utc()
            f.wpp_last_error = None
            f.wpp_next_retry_at = None
            sent += 1
        except BlibsendError as e:
            mark_failed_generic(
                row=f,
                tries_field="wpp_tries",
                status_field="wpp_status",
                error_field="wpp_last_error",
                next_retry_field="wpp_next_retry_at",
                err=str(e),
            )

        db.flush()

    return sent


from sqlalchemy.orm import selectinload

def format_br_phone(phone: str) -> str:
    # espera "83999910018" (11 dígitos) ou "999910018" (9 dígitos)
    digits = "".join(ch for ch in (phone or "") if ch.isdigit())
    if len(digits) == 11:
        ddd = digits[:2]
        p1 = digits[2:7]
        p2 = digits[7:]
        return f"({ddd}) {p1}-{p2}"
    if len(digits) == 10:
        ddd = digits[:2]
        p1 = digits[2:6]
        p2 = digits[6:]
        return f"({ddd}) {p1}-{p2}"
    return phone or "-"


def process_installments_due_soon(db: Session, to_number: str) -> int:
    """
    envia lembrete de parcelas que vencem em N dias.
    Formato:
      José Paulo
      (83) 99991-0018 • Honda Start 160 (2026) • Próx: R$ X • Venc: DD/MM/AAAA
    """
    days = int(os.getenv("PROMISSORY_REMINDER_DAYS", "5"))
    today = today_local_date()
    target = today + timedelta(days=days)

    stmt = (
        select(InstallmentORM)
        .options(
            selectinload(InstallmentORM.promissory).selectinload(PromissoryORM.client),
            selectinload(InstallmentORM.promissory).selectinload(PromissoryORM.product),
            # se no seu fluxo o produto vier pela sale, deixa esse também:
            selectinload(InstallmentORM.promissory)
            .selectinload(PromissoryORM.sale)
            .selectinload(SaleORM.product),
        )
        .where(
            and_(
                InstallmentORM.status == InstallmentStatus.PENDING,
                InstallmentORM.due_date == target,
                InstallmentORM.wa_due_status != WppSendStatus.SENT,
                or_(
                    InstallmentORM.wa_due_next_retry_at.is_(None),
                    InstallmentORM.wa_due_next_retry_at <= now_utc(),
                ),
            )
        )
        .order_by(InstallmentORM.due_date.asc(), InstallmentORM.id.asc())
        .limit(200)
    )

    rows = db.execute(stmt).scalars().all()
    sent = 0

    for inst in rows:
        if not can_try(inst.wa_due_status, inst.wa_due_next_retry_at):
            continue

        inst.wa_due_status = WppSendStatus.SENDING
        db.flush()

        prom = inst.promissory
        client = prom.client if prom else None

        # tenta pegar produto direto da promissory; se não tiver, tenta pela sale
        product = None
        if prom is not None:
            product = prom.product
            if product is None and prom.sale is not None:
                product = prom.sale.product

        client_name = (client.name if client else "-") or "-"
        client_phone = format_br_phone(client.phone if client else "")

        if product:
            moto_label = f"{product.brand} {product.model} ({product.year})"
        else:
            moto_label = "Produto -"

        # formata data BR
        due_str = inst.due_date.strftime("%d/%m/%Y")

        msg = (
            f"{client_name}\n"
            f"{client_phone} • {moto_label} • Próx: R$ {inst.amount} • Venc: {due_str}"
        )

        try:
            send_whatsapp_text(to=to_number, body=msg)
            inst.wa_due_status = WppSendStatus.SENT
            inst.wa_due_sent_at = now_utc()
            inst.wa_due_last_error = None
            inst.wa_due_next_retry_at = None
            sent += 1
        except BlibsendError as e:
            tries = int(inst.wa_due_tries or 0) + 1
            inst.wa_due_tries = tries
            inst.wa_due_status = WppSendStatus.FAILED
            inst.wa_due_last_error = str(e)[:500]
            inst.wa_due_next_retry_at = now_utc() + timedelta(
                seconds=compute_backoff_seconds(tries)
            )

        db.flush()

    return sent



def process_installments_overdue(db: Session, to_number: str) -> int:
    """
    envia aviso de parcelas atrasadas (Installment pending com due_date < hoje).

    Formato:
      ⚠️ PARCELA ATRASADA
      José Paulo
      (83) 99991-0018 • Honda Start 160 (2026) • Parcela: R$ X • Venc: DD/MM/AAAA
    """
    today = today_local_date()

    stmt = (
        select(InstallmentORM)
        .options(
            selectinload(InstallmentORM.promissory).selectinload(PromissoryORM.client),
            selectinload(InstallmentORM.promissory).selectinload(PromissoryORM.product),
            # fallback caso produto venha da sale:
            selectinload(InstallmentORM.promissory)
            .selectinload(PromissoryORM.sale)
            .selectinload(SaleORM.product),
        )
        .where(
            and_(
                InstallmentORM.status == InstallmentStatus.PENDING,
                InstallmentORM.due_date < today,
                InstallmentORM.wa_overdue_status != WppSendStatus.SENT,
                or_(
                    InstallmentORM.wa_overdue_next_retry_at.is_(None),
                    InstallmentORM.wa_overdue_next_retry_at <= now_utc(),
                ),
            )
        )
        .order_by(InstallmentORM.due_date.asc(), InstallmentORM.id.asc())
        .limit(100)
    )

    rows = db.execute(stmt).scalars().all()
    sent = 0

    for inst in rows:
        if not can_try(inst.wa_overdue_status, inst.wa_overdue_next_retry_at):
            continue

        inst.wa_overdue_status = WppSendStatus.SENDING
        db.flush()

        prom = inst.promissory
        client = prom.client if prom else None

        product = None
        if prom is not None:
            product = prom.product
            if product is None and prom.sale is not None:
                product = prom.sale.product

        client_name = (client.name if client else "-") or "-"
        client_phone = format_br_phone(client.phone if client else "")

        moto_label = (
            f"{product.brand} {product.model} ({product.year})" if product else "Produto -"
        )

        due_str = inst.due_date.strftime("%d/%m/%Y")

        msg = (
            "⚠️ PARCELA ATRASADA\n"
            f"{client_name}\n"
            f"{client_phone} • {moto_label} • Parcela: R$ {inst.amount} • Venc: {due_str}"
        )

        try:
            send_whatsapp_text(to=to_number, body=msg)
            inst.wa_overdue_status = WppSendStatus.SENT
            inst.wa_overdue_sent_at = now_utc()
            inst.wa_overdue_last_error = None
            inst.wa_overdue_next_retry_at = None
            sent += 1
        except BlibsendError as e:
            tries = int(inst.wa_overdue_tries or 0) + 1
            inst.wa_overdue_tries = tries
            inst.wa_overdue_status = WppSendStatus.FAILED
            inst.wa_overdue_last_error = str(e)[:500]
            inst.wa_overdue_next_retry_at = now_utc() + timedelta(
                seconds=compute_backoff_seconds(tries)
            )

        db.flush()

    return sent


def image_to_data_uri_jpeg_optimized(
    file_path: str,
    *,
    max_dim: int,
    quality: int,
    max_bytes: int,
) -> str:
    """
    Lê a imagem, reduz dimensão, reencoda como JPEG e retorna:
      data:image/jpeg;base64,...
    max_bytes é o tamanho do JPEG antes do base64 (base64 aumenta ~33%).
    """
    p = Path(file_path)
    if not p.exists():
        raise BlibsendError(f"Arquivo não encontrado: {file_path}")

    with Image.open(p) as img:
        img = img.convert("RGB")

        w, h = img.size
        scale = min(1.0, max_dim / float(max(w, h)))
        if scale < 1.0:
            img = img.resize((int(w * scale), int(h * scale)))

        q = int(quality)
        while True:
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=q, optimize=True)
            raw = buf.getvalue()

            if len(raw) <= max_bytes or q <= 35:
                b64 = base64.b64encode(raw).decode("utf-8")
                return f"data:image/jpeg;base64,{b64}"

            q -= 10


def process_daily_product_offers(db: Session, group_to: str) -> int:
    """
    Envia ofertas diárias para grupo:
      - apenas IN_STOCK
      - manda a primeira imagem do produto
      - intervalo entre envios
      - limite por dia
    """
    limit_query = int(os.getenv("PRODUCTS_OFFER_LIMIT", "20"))
    max_per_day = int(os.getenv("OFFERS_MAX_PER_DAY", "5"))
    interval_s = int(os.getenv("OFFERS_SEND_INTERVAL_SECONDS", "8"))

    max_dim = int(os.getenv("OFFERS_IMAGE_MAX_DIM", "1280"))
    quality = int(os.getenv("OFFERS_IMAGE_QUALITY", "70"))
    max_bytes = int(os.getenv("OFFERS_IMAGE_MAX_BYTES", "850000"))

    stmt = (
        select(ProductORM)
        .options(selectinload(ProductORM.images))
        .where(ProductORM.status == ProductStatus.IN_STOCK)
        .order_by(ProductORM.id.desc())
        .limit(limit_query)
    )

    products = db.execute(stmt).scalars().all()
    print(
        f"[worker] offers: found {len(products)} products IN_STOCK "
        f"(query_limit={limit_query}, max_per_day={max_per_day}, interval={interval_s}s)"
    )

    sent = 0
    for p in products:
        if sent >= max_per_day:
            print(f"[worker] offers: reached max_per_day={max_per_day}, stopping")
            break

        images = sorted(p.images or [], key=lambda x: x.position or 9999)
        if not images:
            print(f"[worker] offers: product {p.id} has no images, skipping")
            continue

        cover = images[0]
        # cover.url exemplo: "/static/products/1/abc.jpg"
        rel = cover.url.replace("/static/", "").lstrip("/")
        file_path = str(UPLOAD_ROOT / rel)

        if not Path(file_path).exists():
            print(f"[worker] offers: missing file for product {p.id}: {file_path}")
            continue

        title = (
            "🔥 OFERTA DO DIA 🔥\n"
            f"🏍️ {p.brand} - {p.model}\n"
            f"Ano: {p.year} - Cor: {p.color}\n"
            f"Valor: R$ {p.sale_price}\n"
        )

        try:
            print(
                f"[worker] offers: encoding image product {p.id} "
                f"(max_dim={max_dim}, quality={quality}, max_bytes={max_bytes})"
            )
            body = image_to_data_uri_jpeg_optimized(
                file_path,
                max_dim=max_dim,
                quality=quality,
                max_bytes=max_bytes,
            )

            print(f"[worker] offers: sending product {p.id} to group={group_to}")
            send_whatsapp_group_file_datauri(
                to_group=group_to,
                type_="image",
                title=title,
                body=body,
            )
            sent += 1
            print(f"[worker] offers: sent={sent}/{max_per_day}")

            if interval_s > 0:
                time.sleep(interval_s)

        except BlibsendError as e:
            # aqui não tem retry em DB (você disse que não quer alterar models)
            print(f"[worker] offers: FAILED product {p.id}: {e}")

    print(f"[worker] offers: sent total={sent}")
    return sent


def run_loop() -> None:
    to_number = os.getenv("BLIBSEND_DEFAULT_TO", "").strip()
    if not to_number:
        raise RuntimeError("Configure BLIBSEND_DEFAULT_TO no .env (numero destino do dono).")

    group_to = os.getenv("BLIBSEND_PRODUCTS_GROUP_TO", "").strip()
    if not group_to:
        raise RuntimeError("Configure BLIBSEND_PRODUCTS_GROUP_TO no .env (grupo destino).")

    interval = int(os.getenv("WORKER_INTERVAL_SECONDS", "30"))
    days = int(os.getenv("PROMISSORY_REMINDER_DAYS", "5"))

    offer_hour = int(os.getenv("PRODUCTS_OFFER_HOUR", "9"))
    offer_limit = int(os.getenv("PRODUCTS_OFFER_LIMIT", "20"))
    offer_interval = int(os.getenv("OFFERS_SEND_INTERVAL_SECONDS", "8"))
    offer_max = int(os.getenv("OFFERS_MAX_PER_DAY", "5"))

    print(
        f"[worker] started. interval={interval}s to={to_number} due_soon_days={days} "
        f"offers_hour={offer_hour} offers_limit={offer_limit} offers_interval={offer_interval}s "
        f"offers_max={offer_max} group_to={group_to}"
    )

    while True:
        started = time.time()

        with SessionLocal() as db:
            try:
                a = process_finance(db, to_number)
                c = process_installments_due_soon(db, to_number)
                b = process_installments_overdue(db, to_number)

                d = 0
                now_local = datetime.now()
                sent_today = already_sent_offers_today()
                print(f"[worker] offers check: now={now_local} offer_hour={offer_hour} sent_today={sent_today}")

                if now_local.hour >= offer_hour and not sent_today:
                    print("[worker] offers: starting...")
                    d = process_daily_product_offers(db, group_to)

                    # só trava se enviou algo
                    if d > 0:
                        mark_offers_sent_today()
                        print("[worker] offers: locked day (sent_today=True)")
                    else:
                        print("[worker] offers: nothing sent, NOT locking the day")

                db.commit()

                if a or b or c or d:
                    print(f"[worker] sent finance={a} due_soon_installments={c} overdue_installments={b} offers={d}")

            except Exception as e:
                db.rollback()
                print(f"[worker] ERROR: {e}")

        elapsed = time.time() - started
        sleep_for = max(1, interval - int(elapsed))
        time.sleep(sleep_for)


if __name__ == "__main__":
    try:
        run_loop()
    except KeyboardInterrupt:
        print("[worker] stopped (Ctrl+C)")
