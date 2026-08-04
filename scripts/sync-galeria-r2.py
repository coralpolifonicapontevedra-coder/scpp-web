#!/usr/bin/env python3
"""Sincroniza a galería pública con R2 fóra do fluxo de navegación.

Verifica que cada orixinal exista no bucket público, xera unha miniatura WebP
reutilizable e publica un índice atómico só con fotografías válidas. Un fallo
non substitúe o último índice correcto.
"""

from __future__ import annotations

import hashlib
import io
import json
import os
import sys
import time
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote, unquote, urlparse

import boto3
import requests
from botocore.config import Config
from botocore.exceptions import ClientError
from PIL import Image, ImageOps, UnidentifiedImageError

INDEX_KEY = "indices/galeria-publica-v1.json"
THUMB_PREFIX = "miniaturas/galeria/"
SITE_URL = os.getenv("SCPP_SITE_URL", "https://scpp-web.pages.dev").rstrip("/")
SOURCE_URL = f"{SITE_URL}/api/galeria"
ATTEMPTS = int(os.getenv("SYNC_ATTEMPTS", "5"))
TIMEOUT_SECONDS = int(os.getenv("SYNC_TIMEOUT_SECONDS", "90"))
THUMB_MAX_WIDTH = int(os.getenv("THUMB_MAX_WIDTH", "720"))
THUMB_MAX_HEIGHT = int(os.getenv("THUMB_MAX_HEIGHT", "540"))
THUMB_QUALITY = int(os.getenv("THUMB_QUALITY", "78"))


def required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Falta a variable obrigatoria {name}")
    return value


def text(value: Any = "") -> str:
    return str(value or "").strip()


def first(photo: dict[str, Any], *names: str) -> str:
    for name in names:
        value = text(photo.get(name))
        if value:
            return value
    return ""


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
                    "User-Agent": "SCPP-R2-Synchronizer/2.0",
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


def object_key(photo: dict[str, Any]) -> str:
    direct = first(
        photo,
        "rutaR2Publica",
        "rutaR2_Publica",
        "RutaR2_Publica",
        "rutaR2",
        "RutaR2",
    )
    if direct:
        return direct.lstrip("/")

    public_url = first(photo, "urlPublica", "UrlPublica")
    if not public_url:
        return ""
    path = unquote(urlparse(public_url).path)
    marker = "/arquivos/publico/"
    if marker in path:
        return path.split(marker, 1)[1].lstrip("/")
    return ""


def public_url(key: str, version: str) -> str:
    encoded = "/".join(quote(part, safe="") for part in key.split("/"))
    return f"/arquivos/publico/{encoded}?v={quote(version, safe='')}"


def safe_id(photo: dict[str, Any], key: str) -> str:
    candidate = first(photo, "idFoto", "Id_Foto", "rowId", "Row ID")
    raw = candidate or key
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24]


def head_object(client: Any, bucket: str, key: str) -> dict[str, Any] | None:
    try:
        return client.head_object(Bucket=bucket, Key=key)
    except ClientError as exc:
        code = text(exc.response.get("Error", {}).get("Code"))
        if code in {"404", "NoSuchKey", "NotFound"}:
            return None
        raise


def make_thumbnail(source: bytes) -> bytes:
    try:
        with Image.open(io.BytesIO(source)) as image:
            image = ImageOps.exif_transpose(image)
            if image.mode not in {"RGB", "RGBA"}:
                image = image.convert("RGB")
            if image.mode == "RGBA":
                background = Image.new("RGB", image.size, "white")
                background.paste(image, mask=image.getchannel("A"))
                image = background
            image.thumbnail((THUMB_MAX_WIDTH, THUMB_MAX_HEIGHT), Image.Resampling.LANCZOS)
            output = io.BytesIO()
            image.save(output, format="WEBP", quality=THUMB_QUALITY, method=6)
            return output.getvalue()
    except (UnidentifiedImageError, OSError) as exc:
        raise RuntimeError(f"Formato de imaxe non compatible: {exc}") from exc


def ensure_thumbnail(
    client: Any,
    bucket: str,
    original_key: str,
    original_head: dict[str, Any],
    photo_id: str,
) -> tuple[str, bool]:
    etag = text(original_head.get("ETag")).strip('"')
    thumb_key = f"{THUMB_PREFIX}{photo_id}.webp"
    existing = head_object(client, bucket, thumb_key)
    metadata = existing.get("Metadata", {}) if existing else {}
    if existing and text(metadata.get("source-etag")) == etag:
        return thumb_key, False

    source = client.get_object(Bucket=bucket, Key=original_key)["Body"].read()
    thumbnail = make_thumbnail(source)
    client.put_object(
        Bucket=bucket,
        Key=thumb_key,
        Body=thumbnail,
        ContentType="image/webp",
        CacheControl="public, max-age=31536000, immutable",
        Metadata={"source-etag": etag, "source-key-sha": hashlib.sha256(original_key.encode()).hexdigest()[:32]},
    )
    return thumb_key, True


def build_index(payload: dict[str, Any], client: Any, bucket: str) -> dict[str, Any]:
    valid: list[dict[str, Any]] = []
    missing: list[dict[str, str]] = []
    errors: list[dict[str, str]] = []
    generated = 0
    reused = 0

    for position, raw in enumerate(payload["fotos"], start=1):
        photo = dict(raw)
        key = object_key(photo)
        title = first(photo, "titulo", "Titulo", "peFoto", "PeFoto") or f"Fotografía {position}"
        if not key:
            missing.append({"titulo": title, "motivo": "sen ruta R2"})
            continue

        try:
            original_head = head_object(client, bucket, key)
            if not original_head:
                missing.append({"titulo": title, "ruta": key, "motivo": "orixinal inexistente"})
                continue

            photo_id = safe_id(photo, key)
            thumb_key, created = ensure_thumbnail(client, bucket, key, original_head, photo_id)
            generated += int(created)
            reused += int(not created)
            etag = text(original_head.get("ETag")).strip('"') or photo_id

            photo.update(
                {
                    "rutaR2Publica": key,
                    "rutaMiniaturaPublica": thumb_key,
                    "urlPublica": public_url(key, etag),
                    "urlMiniaturaPublica": public_url(thumb_key, etag),
                    "orixinalVerificado": True,
                    "tamanoOrixinal": int(original_head.get("ContentLength") or 0),
                }
            )
            valid.append(photo)
        except Exception as exc:  # noqa: BLE001
            errors.append({"titulo": title, "ruta": key, "erro": str(exc)})
            print(f"ERRO procesando {key}: {exc}", file=sys.stderr)

    now = datetime.now(timezone.utc)
    return {
        "ok": True,
        "fotos": valid,
        "xeradoEn": now.isoformat(),
        "xeradoEnMs": int(now.timestamp() * 1000),
        "orixe": "GITHUB_ACTIONS_R2_VERIFIED",
        "total": len(valid),
        "recibidas": len(payload["fotos"]),
        "miniaturasXeradas": generated,
        "miniaturasReutilizadas": reused,
        "faltantes": missing,
        "erros": errors,
        "version": "2",
    }


def r2_client() -> tuple[Any, str]:
    account_id = required("R2_ACCOUNT_ID")
    access_key = required("R2_ACCESS_KEY_ID")
    secret_key = required("R2_SECRET_ACCESS_KEY")
    bucket = (os.getenv("R2_PUBLIC_BUCKET") or "scpp-publico").strip()
    client = boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="auto",
        config=Config(retries={"max_attempts": 5, "mode": "standard"}),
    )
    return client, bucket


def upload_index(index: dict[str, Any], client: Any, bucket: str) -> None:
    body = json.dumps(index, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    client.put_object(
        Bucket=bucket,
        Key=INDEX_KEY,
        Body=body,
        ContentType="application/json; charset=utf-8",
        CacheControl="public, max-age=300",
        Metadata={
            "scpp-source": "github-actions-r2-verified",
            "scpp-generated-at": str(index["xeradoEnMs"]),
        },
    )
    print(
        f"Índice publicado: s3://{bucket}/{INDEX_KEY} "
        f"({len(body)} bytes, {index['total']}/{index['recibidas']} fotos válidas, "
        f"{index['miniaturasXeradas']} miniaturas novas, "
        f"{len(index['faltantes'])} faltantes, {len(index['erros'])} erros)"
    )


def main() -> int:
    payload = fetch_gallery()
    client, bucket = r2_client()
    index = build_index(payload, client, bucket)
    if not index["fotos"]:
        raise RuntimeError("A verificación non atopou ningunha fotografía pública válida; mantense o índice anterior")
    upload_index(index, client, bucket)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"ERRO: {exc}", file=sys.stderr)
        raise SystemExit(1)
