#!/usr/bin/env python3
"""Xera o índice público da galería fóra do fluxo de navegación.

Obtén a última lista válida da API da web con reintentos e publica un JSON
atómico en R2. Se a consulta falla, non substitúe o índice anterior.
"""

from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timezone
from typing import Any

import boto3
import requests
from botocore.config import Config

INDEX_KEY = "indices/galeria-publica-v1.json"
SITE_URL = os.getenv("SCPP_SITE_URL", "https://scpp-web.pages.dev").rstrip("/")
SOURCE_URL = f"{SITE_URL}/api/galeria"
ATTEMPTS = int(os.getenv("SYNC_ATTEMPTS", "5"))
TIMEOUT_SECONDS = int(os.getenv("SYNC_TIMEOUT_SECONDS", "90"))


def required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Falta a variable obrigatoria {name}")
    return value


def fetch_gallery() -> dict[str, Any]:
    last_error: Exception | None = None
    for attempt in range(1, ATTEMPTS + 1):
        started = time.monotonic()
        try:
            response = requests.get(
                SOURCE_URL,
                headers={
                    "Accept": "application/json",
                    "Cache-Control": "no-cache",
                    "User-Agent": "SCPP-R2-Synchronizer/1.0",
                },
                timeout=TIMEOUT_SECONDS,
            )
            response.raise_for_status()
            payload = response.json()
            if payload.get("ok") is not True or not isinstance(payload.get("fotos"), list):
                raise RuntimeError(payload.get("erro") or "Resposta da galería non válida")
            elapsed_ms = round((time.monotonic() - started) * 1000)
            print(f"Consulta correcta no intento {attempt}: {elapsed_ms} ms")
            return payload
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            print(f"Intento {attempt}/{ATTEMPTS} fallido: {exc}", file=sys.stderr)
            if attempt < ATTEMPTS:
                time.sleep(min(10 * attempt, 30))
    raise RuntimeError(f"Non foi posible obter a galería tras {ATTEMPTS} intentos: {last_error}")


def upload_index(payload: dict[str, Any]) -> None:
    account_id = required("R2_ACCOUNT_ID")
    access_key = required("R2_ACCESS_KEY_ID")
    secret_key = required("R2_SECRET_ACCESS_KEY")
    bucket = (os.getenv("R2_PUBLIC_BUCKET") or os.getenv("R2_BUCKET") or "").strip()
    if not bucket:
        raise RuntimeError("Falta R2_PUBLIC_BUCKET ou R2_BUCKET")

    now = datetime.now(timezone.utc)
    index = {
        "ok": True,
        "fotos": payload["fotos"],
        "xeradoEn": now.isoformat(),
        "xeradoEnMs": int(now.timestamp() * 1000),
        "orixe": "GITHUB_ACTIONS",
        "total": len(payload["fotos"]),
        "version": "1",
    }
    body = json.dumps(index, ensure_ascii=False, separators=(",", ":")).encode("utf-8")

    client = boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="auto",
        config=Config(retries={"max_attempts": 5, "mode": "standard"}),
    )
    client.put_object(
        Bucket=bucket,
        Key=INDEX_KEY,
        Body=body,
        ContentType="application/json; charset=utf-8",
        CacheControl="public, max-age=300",
        Metadata={
            "scpp-source": "github-actions",
            "scpp-generated-at": str(index["xeradoEnMs"]),
        },
    )
    print(f"Índice publicado: s3://{bucket}/{INDEX_KEY} ({len(body)} bytes, {index['total']} fotos)")


def main() -> int:
    payload = fetch_gallery()
    upload_index(payload)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"ERRO: {exc}", file=sys.stderr)
        raise SystemExit(1)
