#!/usr/bin/env python3
"""Constrúe o índice público de Honras en R2 a partir da Sheet.

A web nunca consulta Google en tempo real: só le indices/honras-v1.json.
Se a extracción ou a validación falla, non se substitúe o último índice válido.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import os
import re
import sys
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PUBLIC_BUCKET = os.getenv("R2_PUBLIC_BUCKET", "scpp-publico").strip()
PUBLIC_INDEX_KEY = "indices/honras-v1.json"
ATTEMPTS = int(os.getenv("SYNC_ATTEMPTS", "5"))
TIMEOUT_SECONDS = int(os.getenv("SYNC_TIMEOUT_SECONDS", "90"))
REQUIRED_HEADERS = {
    "id_honra", "categoria", "data", "ano", "festividade", "persoaentidade",
    "tipodestinatario", "condicion", "observacions", "mostrarweb", "orde"
}


def text(value: Any = "") -> str:
    return str(value or "").strip()


def normalize(value: Any = "") -> str:
    raw = unicodedata.normalize("NFD", text(value))
    return "".join(ch for ch in raw if unicodedata.category(ch) != "Mn").lower()


def header_name(value: Any = "") -> str:
    return re.sub(r"[^a-z0-9]+", "", normalize(value))


def truthy(value: Any = "") -> bool:
    return normalize(value) in {"true", "si", "yes", "1", "y", "verdadeiro"}


def integer(value: Any = "") -> int | None:
    raw = text(value)
    if not raw:
        return None
    number = float(raw.replace(",", "."))
    if not number.is_integer():
        raise ValueError(f"Agardábase un enteiro e chegou: {raw}")
    return int(number)


def iso_date(value: Any = "") -> str:
    raw = text(value)
    if not raw:
        return ""
    for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    raise ValueError(f"Data non válida: {raw}")


def parse_csv(content: str) -> tuple[list[dict[str, str]], set[str]]:
    reader = csv.DictReader(io.StringIO(content.lstrip("\ufeff")))
    if not reader.fieldnames:
        raise RuntimeError("A fonte Honras non ten cabeceiras")
    headers = {header_name(name) for name in reader.fieldnames if text(name)}
    rows = []
    for raw in reader:
        row = {header_name(k): text(v) for k, v in raw.items() if k is not None and text(k)}
        if any(row.values()):
            rows.append(row)
    if not rows:
        raise RuntimeError("A fonte Honras non contén rexistros")
    return rows, headers


def fetch_source() -> tuple[list[dict[str, str]], set[str]]:
    local_file = text(os.getenv("HONRAS_CSV_FILE"))
    if local_file:
        return parse_csv(Path(local_file).read_text(encoding="utf-8-sig"))

    url = text(os.getenv("HONRAS_CSV_URL"))
    if not url:
        raise RuntimeError("Falta HONRAS_CSV_URL ou HONRAS_CSV_FILE")

    import requests
    last_error: Exception | None = None
    for attempt in range(1, ATTEMPTS + 1):
        try:
            response = requests.get(url, headers={"Accept": "text/csv", "Cache-Control": "no-cache"}, timeout=TIMEOUT_SECONDS)
            response.raise_for_status()
            rows, headers = parse_csv(response.content.decode("utf-8-sig"))
            print(f"Honras: {len(rows)} filas no intento {attempt}")
            return rows, headers
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            print(f"Intento {attempt}/{ATTEMPTS} fallido: {exc}", file=sys.stderr)
            if attempt < ATTEMPTS:
                time.sleep(min(attempt * 10, 30))
    raise RuntimeError(f"Non foi posible obter Honras: {last_error}")


def build(rows: list[dict[str, str]], headers: set[str]) -> list[dict[str, Any]]:
    missing = sorted(REQUIRED_HEADERS - headers)
    if missing:
        raise RuntimeError("Faltan columnas en Honras: " + ", ".join(missing))

    honras = []
    ids = set()
    for row_number, row in enumerate(rows, start=2):
        ident = text(row.get("idhonra"))
        if not ident:
            raise RuntimeError(f"Honras fila {row_number}: falta Id_Honra")
        if ident in ids:
            raise RuntimeError(f"Id_Honra duplicado: {ident}")
        ids.add(ident)
        if not truthy(row.get("mostrarweb")):
            continue
        ano = integer(row.get("ano"))
        if ano is None:
            raise RuntimeError(f"Honra {ident}: falta Ano")
        nome = text(row.get("persoaentidade"))
        categoria = text(row.get("categoria"))
        if not nome or not categoria:
            raise RuntimeError(f"Honra {ident}: falta Categoria ou PersoaEntidade")
        honras.append({
            "id": ident,
            "categoria": categoria,
            "data": iso_date(row.get("data")),
            "ano": ano,
            "festividade": text(row.get("festividade")),
            "persoaEntidade": nome,
            "tipoDestinatario": text(row.get("tipodestinatario")),
            "condicion": text(row.get("condicion")),
            "observacions": text(row.get("observacions")),
            "orde": integer(row.get("orde")) or 999,
        })

    if not honras:
        raise RuntimeError("Non hai honras con MostrarWeb activado; mantense o índice anterior")
    honras.sort(key=lambda item: (item["categoria"], -item["ano"], item["orde"], item["persoaEntidade"]))
    return honras


def payload(honras: list[dict[str, Any]]) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    return {
        "ok": True,
        "version": 1,
        "xeradoEn": now.isoformat(),
        "xeradoEnMs": int(now.timestamp() * 1000),
        "orixe": "GITHUB_ACTIONS_SHEETS_R2",
        "total": len(honras),
        "honras": honras,
    }


def required(name: str) -> str:
    value = text(os.getenv(name))
    if not value:
        raise RuntimeError(f"Falta a variable obrigatoria {name}")
    return value


def r2_client():
    import boto3
    from botocore.config import Config
    return boto3.client(
        "s3",
        endpoint_url=f"https://{required('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com",
        aws_access_key_id=required("R2_ACCESS_KEY_ID"),
        aws_secret_access_key=required("R2_SECRET_ACCESS_KEY"),
        region_name="auto",
        config=Config(retries={"max_attempts": 5, "mode": "standard"}),
    )


def head_object(client: Any, bucket: str, key: str) -> dict[str, Any] | None:
    from botocore.exceptions import ClientError
    try:
        return client.head_object(Bucket=bucket, Key=key)
    except ClientError as exc:
        if text(exc.response.get("Error", {}).get("Code")) in {"404", "NoSuchKey", "NotFound"}:
            return None
        raise


def publish(client: Any, body: dict[str, Any]) -> bool:
    data_body = json.dumps(body["honras"], ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")
    data_sha = hashlib.sha256(data_body).hexdigest()
    current = head_object(client, PUBLIC_BUCKET, PUBLIC_INDEX_KEY)
    if current and text(current.get("Metadata", {}).get("data-sha256")) == data_sha:
        print(f"Sen cambios: s3://{PUBLIC_BUCKET}/{PUBLIC_INDEX_KEY}")
        return False
    raw = json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    body_sha = hashlib.sha256(raw).hexdigest()
    client.put_object(
        Bucket=PUBLIC_BUCKET,
        Key=PUBLIC_INDEX_KEY,
        Body=raw,
        ContentType="application/json; charset=utf-8",
        CacheControl="public, max-age=300",
        Metadata={"data-sha256": data_sha, "body-sha256": body_sha, "scpp-source": "github-actions-sheets-r2"},
    )
    verified = head_object(client, PUBLIC_BUCKET, PUBLIC_INDEX_KEY)
    if not verified or int(verified.get("ContentLength", 0)) != len(raw):
        raise RuntimeError("Fallou a verificación do índice Honras en R2")
    print(f"Publicado: s3://{PUBLIC_BUCKET}/{PUBLIC_INDEX_KEY} ({len(raw)} bytes, {body['total']} honras)")
    return True


def run() -> int:
    rows, headers = fetch_source()
    honras = build(rows, headers)
    changed = publish(r2_client(), payload(honras))
    print(json.dumps({"publicas": len(honras), "indiceActualizado": changed}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(run())
    except Exception as exc:  # noqa: BLE001
        print(f"ERRO: {exc}", file=sys.stderr)
        raise SystemExit(1)
