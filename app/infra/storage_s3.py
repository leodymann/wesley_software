import os
import uuid
from typing import Optional

import boto3
from botocore.config import Config

class StorageError(RuntimeError):
    pass

def _s3_client():
    endpoint = os.getenv("S3_ENDPOINT")
    key = os.getenv("S3_ACCESS_KEY_ID")
    secret = os.getenv("S3_SECRET_ACCESS_KEY")
    region = os.getenv("S3_REGION", "us-east-1")

    if not endpoint or not key or not secret:
        raise StorageError("S3 vars missing: S3_ENDPOINT/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY")

    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=key,
        aws_secret_access_key=secret,
        region_name=region,
        config=Config(signature_version="s3v4"),
    )

def upload_bytes(
    content: bytes,
    content_type: str,
    *,
    prefix: str = "uploads",
    filename: Optional[str] = None,
) -> str:
    bucket = os.getenv("S3_BUCKET")
    if not bucket:
        raise StorageError("S3_BUCKET not configured")

    if not filename:
        filename = f"{uuid.uuid4().hex}"

    key = f"{prefix}/{filename}"

    s3 = _s3_client()
    s3.put_object(
        Bucket=bucket,
        Key=key,
        Body=content,
        ContentType=content_type,
        ACL="public-read",  # se seu bucket for público
    )

    public_base = os.getenv("S3_PUBLIC_BASE_URL")
    if public_base:
        return f"{public_base.rstrip('/')}/{key}"

    # fallback: tenta montar URL pelo endpoint (nem sempre é a URL pública)
    endpoint = os.getenv("S3_ENDPOINT").rstrip("/")
    return f"{endpoint}/{bucket}/{key}"
