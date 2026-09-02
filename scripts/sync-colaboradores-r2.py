#!/usr/bin/env python3
"""Publica en R2 os logotipos de colaboradores usados pola web pública.

A web serve estes ficheiros exclusivamente desde R2 a través de
/arquivos/publico/<clave>. Os ficheiros do repositorio son só a fonte de
versionado para esta sincronización, non a URL pública de produción.
"""

from __future__ import annotations

import os
from pathlib import Path

import boto3
from botocore.config import Config

SOURCE_DIR = Path("public/img/colaboradores")
R2_PREFIX = "colaboradores/v1/"
PUBLIC_BUCKET = os.getenv("R2_PUBLIC_BUCKET", "scpp-publico").strip()


def required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Falta a variable obrigatoria {name}")
    return value


def main() -> int:
    account_id = required_env("R2_ACCOUNT_ID")
    access_key = required_env("R2_ACCESS_KEY_ID")
    secret_key = required_env("R2_SECRET_ACCESS_KEY")

    client = boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="auto",
        config=Config(signature_version="s3v4"),
    )

    files = sorted(SOURCE_DIR.glob("*.png"))
    if not files:
        raise RuntimeError(f"Non hai PNG para sincronizar en {SOURCE_DIR}")

    for path in files:
        key = f"{R2_PREFIX}{path.name}"
        data = path.read_bytes()
        client.put_object(
            Bucket=PUBLIC_BUCKET,
            Key=key,
            Body=data,
            ContentLength=len(data),
            ContentType="image/png",
            CacheControl="public, max-age=86400",
        )

        head = client.head_object(Bucket=PUBLIC_BUCKET, Key=key)
        if int(head.get("ContentLength", -1)) != len(data):
            raise RuntimeError(f"Verificación de tamaño fallida para {key}")
        print(f"R2 OK {path.name} -> {PUBLIC_BUCKET}/{key} ({len(data)} bytes)")

    print(f"Sincronizados {len(files)} logos en R2 público.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
