from __future__ import annotations

import os
import uuid

import boto3
from botocore.config import Config


class StorageError(RuntimeError):
    pass


def _get_env(name: str) -> str:
    v = os.getenv(name, "").strip()
    if not v:
        raise StorageError(f"Missing env var: {name}")
    return v


def _s3_client():
    endpoint = _get_env("S3_ENDPOINT")
    access_key = _get_env("S3_ACCESS_KEY_ID")
    secret_key = _get_env("S3_SECRET_ACCESS_KEY")
    region = os.getenv("S3_REGION", "auto").strip() or "auto"

    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name=region,
        config=Config(signature_version="s3v4"),
    )


def bucket_name() -> str:
    return _get_env("S3_BUCKET")


def make_image_key(product_id: int, filename: str) -> str:
    return f"products/{product_id}/{filename}"


def random_filename(ext: str) -> str:
    return f"{uuid.uuid4().hex}{ext}"


def put_bytes(*, content: bytes, content_type: str, key: str) -> str:
    """
    Upload privado. Retorna a KEY (não URL).
    """
    s3 = _s3_client()
    s3.put_object(
        Bucket=bucket_name(),
        Key=key,
        Body=content,
        ContentType=content_type,
    )
    return key


def get_bytes(key: str) -> bytes:
    s3 = _s3_client()
    obj = s3.get_object(Bucket=bucket_name(), Key=key)
    return obj["Body"].read()


def presign_get_url(key: str, expires_seconds: int = 3600) -> str:
    s3 = _s3_client()
    return s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket_name(), "Key": key},
        ExpiresIn=expires_seconds,
    )


def delete_object(key: str) -> None:
    s3 = _s3_client()
    s3.delete_object(Bucket=bucket_name(), Key=key)
