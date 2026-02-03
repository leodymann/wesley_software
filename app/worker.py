# app/worker.py
from __future__ import annotations

import os
import time
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import select, and_, or_
from sqlalchemy.orm import Session
from dotenv import load_dotenv

from app.infra.db import SessionLocal
from app.infra.models import (
    FinanceORM, FinanceStatus, WppSendStatus,
    InstallmentORM, InstallmentStatus,
)
from app.integrations.blibsend import send_whatsapp_text, BlibsendError

# carrega .env quando rodar como script
load_dotenv()


def now_utc() -> datetime:
    return datetime.utcnow()


def today_local_date():
    return datetime.now().date()


def compute_backoff_seconds(tries: int) -> int:
    # 1° falha: 1 min, 2°: 5 min, 3°: 15 min, 4°: 1h, depois 6h
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
):
    tries = int(getattr(row, tries_field) or 0) + 1
    setattr(row, tries_field, tries)
    setattr(row, status_field, WppSendStatus.FAILED)
    setattr(row, error_field, err[:500])
    setattr(row, next_retry_field, now_utc() + timedelta(seconds=compute_backoff_seconds(tries)))


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
            f"ID: {f.id}"
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


def process_installments_overdue(db: Session, to_number: str) -> int:
    """
    envia aviso de parcelas vencidas (Installment pending com due_date < hoje).
    usa InstallmentORM.wa_overdue_* para retry e evitar duplicar.
    """
    today = today_local_date()

    stmt = (
        select(InstallmentORM)
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

        # hoje: manda pro DONO (to_number).
        msg = (
            "Parcela vencida\n"
            f"Contrato: {inst.promissory.public_id}\n"
            f"Parcela: {inst.number}\n"
            f"Venc.: {inst.due_date}\n"
            f"Valor: R$ {inst.amount}\n"
            f"InstallmentID: {inst.id}"
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
            inst.wa_overdue_next_retry_at = now_utc() + timedelta(seconds=compute_backoff_seconds(tries))

        db.flush()

    return sent


def run_loop():
    to_number = os.getenv("BLIBSEND_DEFAULT_TO", "").strip()
    if not to_number:
        raise RuntimeError("Configure BLIBSEND_DEFAULT_TO no .env (numero destino do dono).")

    interval = int(os.getenv("WORKER_INTERVAL_SECONDS", "30"))
    print(f"[worker] started. interval={interval}s to={to_number}")

    while True:
        started = time.time()
        with SessionLocal() as db:
            try:
                a = process_finance(db, to_number)
                b = process_installments_overdue(db, to_number)
                db.commit()
                if a or b:
                    print(f"[worker] sent finance={a} overdue_installments={b}")
            except Exception as e:
                db.rollback()
                print(f"[worker] ERROR: {e}")

        elapsed = time.time() - started
        sleep_for = max(1, interval - int(elapsed))
        time.sleep(sleep_for)


if __name__ == "__main__":
    run_loop()
