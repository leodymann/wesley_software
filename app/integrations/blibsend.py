# app/integrations/blibsend.py
from __future__ import annotations

import base64
import os
import time
from dataclasses import dataclass
from typing import Iterable, Union, List, Optional

import requests
from dotenv import load_dotenv

# carrega .env quando rodar script/worker fora do FastAPI
load_dotenv()


class BlibsendError(RuntimeError):
    pass


@dataclass
class _TokenCache:
    token: str
    expires_at_epoch: float  # time.time()


_TOKEN_CACHE: Optional[_TokenCache] = None


def _base_url() -> str:
    base = os.getenv("BLIBSEND_BASE_URL", "").rstrip("/")
    if not base:
        raise BlibsendError("BLIBSEND_BASE_URL não configurado.")
    return base


def _session_token() -> str:
    st = os.getenv("BLIBSEND_SESSION_TOKEN", "").strip()
    if not st:
        raise BlibsendError("BLIBSEND_SESSION_TOKEN não configurado.")
    return st


def _basic_header_value(client_id: str, client_secret: str) -> str:
    """
    padrão HTTP Basic
      Authorization: Basic base64(client_id:client_secret)
    """
    raw = f"{client_id}:{client_secret}".encode("utf-8")
    b64 = base64.b64encode(raw).decode("ascii")
    return f"Basic {b64}"


def signin() -> _TokenCache:
    """
    POST /auth/signin
    Header: Authorization: Basic <base64(client_id:client_secret)>
    Response:
      { token, token_type: Bearer, exires_in: 86400 }
    """
    global _TOKEN_CACHE

    cid = os.getenv("BLIBSEND_CLIENT_ID", "").strip()
    csec = os.getenv("BLIBSEND_CLIENT_SECRET", "").strip()
    if not cid or not csec:
        raise BlibsendError("BLIBSEND_CLIENT_ID/BLIBSEND_CLIENT_SECRET não configurados.")

    url = f"{_base_url()}/auth/signin"
    headers = {
        "Authorization": _basic_header_value(cid, csec),
        "Content-Type": "application/json",
        "User-Agent": "wi_motos/1.0",
    }

    resp = requests.post(url, headers=headers, timeout=25)

    # signin costuma ser 200+
    if resp.status_code >= 300:
        raise BlibsendError(f"Falha no signin ({resp.status_code}): {resp.text[:300]}")

    data = resp.json()

    token = data.get("token")
    if not token:
        raise BlibsendError("Resposta do signin não contém 'token'.")

    # doc tem typo "exires_in"
    expires_in = data.get("expires_in", data.get("exires_in", 86400))
    try:
        expires_in = int(expires_in)
    except Exception:
        expires_in = 86400

    # margem de segurança de 60s
    cache = _TokenCache(token=token, expires_at_epoch=time.time() + max(60, expires_in - 60))
    _TOKEN_CACHE = cache
    return cache


def get_token() -> str:
    """
    Retorna Bearer token válido, renovando quando necessário.
    """
    global _TOKEN_CACHE
    if _TOKEN_CACHE and _TOKEN_CACHE.expires_at_epoch > time.time():
        return _TOKEN_CACHE.token
    return signin().token


def _normalize_to(to: Union[str, Iterable[str]]) -> List[str]:
    if isinstance(to, str):
        return [to]
    return [x for x in to]


def send_whatsapp_text(*, to: Union[str, Iterable[str]], body: str) -> dict:
    """
    POST /messages/send
    Headers:
      Authorization: Bearer <token>
      session_token: <uuid>
      Content-Type: application/json
    Body:
      { "to": ["5562..."], "body": "Mensagem" }

    Sucesso: 200 ou 201 (na prática pode voltar 200 mesmo com sucesso)
    Erros: 422/401/500

    Retorna o JSON de resposta em caso de sucesso.
    """
    url = f"{_base_url()}/messages/send"

    token = get_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "session_token": _session_token(),
        "Content-Type": "application/json",
        "User-Agent": "wi_motos/1.0",
    }

    payload = {
        "to": _normalize_to(to),
        "body": body,
    }

    resp = requests.post(url, json=payload, headers=headers, timeout=25)

    if resp.status_code == 401:
        # token pode ter expirado/invalidado: renova uma vez e tenta novamente
        signin()
        token = get_token()
        headers["Authorization"] = f"Bearer {token}"
        resp = requests.post(url, json=payload, headers=headers, timeout=25)

    if resp.status_code in (200, 201):
        # geralmente: {"message":"Message sent successfully!","metadata":{"message_id":...}}
        try:
            return resp.json()
        except Exception:
            return {"raw": resp.text}

    raise BlibsendError(f"Falha no envio ({resp.status_code}): {resp.text[:300]}")
