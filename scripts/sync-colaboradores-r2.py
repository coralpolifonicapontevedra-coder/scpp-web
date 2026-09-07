#!/usr/bin/env python3
"""Sincroniza as entidades colaboradoras e os seus logotipos con R2.

Fonte de datos: Sheet de produción "Colaboracións".
Destino público:
- scpp-publico/colaboradores/v1/*.png
- scpp-publico/indices/colaboradores-v1.json

A web pública le exclusivamente o índice de R2. Se Google ou a validación
fallan, o índice anterior consérvase.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlparse

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

SOURCE_DIR = Path("public/img/colaboradores")
R2_PREFIX = "colaboradores/v1/"
INDEX_KEY = "indices/colaboradores-v1.json"
PUBLIC_BUCKET = os.getenv("R2_PUBLIC_BUCKET", "scpp-publico").strip()
SPREADSHEET_ID = os.getenv(
    "COLABORADORES_SPREADSHEET_ID",
    "1mqlMESC6ZkE4t1zfA0q1dK3PRFHtKLO71ifdbT2CtHw",
).strip()
SHEET_NAME = os.getenv("COLABORADORES_SHEET_NAME", "Colaboracións").strip()
TIMEOUT = int(os.getenv("SYNC_TIMEOUT_SECONDS", "90"))

REQUIRED_HEADERS = {
    "idcolaboracion",
    "tipocolaborador",
    "nomecompleto",
    "logoouimaxe",
    "visiblenaweb",
    "web",
    "ordeweb",
}


def text(value: Any = "") -> str:
    return str(value or "").strip()


def normalize(value: Any = "") -> str:
    raw = unicodedata.normalize("NFD", text(value))
    return "".join(ch for ch in raw if unicodedata.category(ch) != "Mn").lower()


def header(value: Any = "") -> str:
    return re.sub(r"[^a-z0-9]+", "", normalize(value))


def truthy(value: Any = "") -> bool:
    return normalize(value) in {"true", "s", "si", "yes", "1", "y", "verdadeiro"}


def integer(value: Any = "") -> int | None:
    raw = text(value)
    if not raw:
        return None
    number = float(raw.replace(",", "."))
    if not number.is_integer():
        raise ValueError(f"Agardábase un enteiro e chegou: {raw}")
    return int(number)


def required_env(name: str) -> str:
    value = text(os.getenv(name))
    if not value:
        raise RuntimeError(f"Falta a variable obrigatoria {name}")
    return value


def r2_client():
    account_id = required_env("R2_ACCOUNT_ID")
    access_key = required_env("R2_ACCESS_KEY_ID")
    secret_key = required_env("R2_SECRET_ACCESS_KEY")
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="auto",
        config=Config(signature_version="s3v4", retries={"max_attempts": 5, "mode": "standard"}),
    )


def load_sheet_rows() -> tuple[list[dict[str, str]], set[str]]:
    raw_credentials = required_env("GOOGLE_SERVICE_ACCOUNT_JSON")
    from google.auth.transport.requests import AuthorizedSession
    from google.oauth2.service_account import Credentials

    credentials = Credentials.from_service_account_info(
        json.loads(raw_credentials),
        scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"],
    )
    session = AuthorizedSession(credentials)
    a1_range = quote(f"{SHEET_NAME}!A:AB", safe="")
    url = f"https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}/values/{a1_range}"
    response = session.get(url, timeout=TIMEOUT)
    response.raise_for_status()
    values = response.json().get("values") or []
    if len(values) < 2:
        raise RuntimeError("A Sheet Colaboracións non contén datos")

    raw_headers = [text(value) for value in values[0]]
    normalized_headers = [header(value) for value in raw_headers]
    headers = {value for value in normalized_headers if value}
    missing = sorted(REQUIRED_HEADERS - headers)
    if missing:
        raise RuntimeError("Faltan columnas en Colaboracións: " + ", ".join(missing))

    rows: list[dict[str, str]] = []
    for raw_row in values[1:]:
        padded = list(raw_row) + [""] * max(0, len(raw_headers) - len(raw_row))
        row = {
            normalized_headers[index]: text(padded[index])
            for index in range(len(raw_headers))
            if normalized_headers[index]
        }
        if any(row.values()):
            rows.append(row)

    print(f"Colaboracións: {len(rows)} filas lidas da Sheet de produción")
    return rows, headers


def logo_key(value: Any) -> str:
    raw = text(value)
    if not raw:
        return ""
    parsed = urlparse(raw if "://" in raw else f"https://scpp.local/{raw.lstrip('/')}")
    path = parsed.path
    marker = "/arquivos/publico/"
    if marker in path:
        path = path.split(marker, 1)[1]
    else:
        path = path.lstrip("/")
    return path


def public_type(tipo: str, lang: str) -> str:
    normalized = normalize(tipo)
    if normalized == "institucion":
        return "Institución colaboradora"
    if normalized == "empresa":
        return "Empresa colaboradora"
    if lang == "es":
        return "Entidad colaboradora"
    return "Entidade colaboradora"


def build_entities(rows: list[dict[str, str]], available_files: set[str]) -> list[dict[str, Any]]:
    ids: set[str] = set()
    result: list[dict[str, Any]] = []

    for row_number, row in enumerate(rows, start=2):
        ident = text(row.get("idcolaboracion"))
        if not ident:
            raise RuntimeError(f"Colaboracións fila {row_number}: falta Id_Colaboracion")
        if ident in ids:
            raise RuntimeError(f"Id_Colaboracion duplicado: {ident}")
        ids.add(ident)

        if not truthy(row.get("visiblenaweb")):
            continue

        nome = text(row.get("nomecompleto")) or text(row.get("nome"))
        tipo = text(row.get("tipocolaborador"))
        web = text(row.get("web"))
        orde = integer(row.get("ordeweb"))
        key = logo_key(row.get("logoouimaxe"))

        if not nome or not tipo or not web or orde is None or not key:
            raise RuntimeError(
                f"Colaboración {ident}: faltan Nomecompleto, TipoColaborador, LogoOuImaxe, Web ou OrdeWeb"
            )
        if not key.startswith(R2_PREFIX):
            raise RuntimeError(f"Colaboración {ident}: ruta de logo fóra de {R2_PREFIX}: {key}")

        filename = key.removeprefix(R2_PREFIX)
        if filename not in available_files:
            raise RuntimeError(f"Colaboración {ident}: non existe o logo fonte {SOURCE_DIR / filename}")

        result.append(
            {
                "id": ident,
                "nome": nome,
                "tipo": tipo,
                "tipoGl": public_type(tipo, "gl"),
                "tipoEs": public_type(tipo, "es"),
                "tipoColaboracion": text(row.get("tipocolaboracion")),
                "logo": f"/arquivos/publico/{key}",
                "logoFallback": f"/img/colaboradores/{filename}",
                "web": web,
                "orde": orde,
                "importe": text(row.get("importe")),
                "periodicidade": text(row.get("periodicidade")),
                "observacions": text(row.get("observacions")),
            }
        )

    if not result:
        raise RuntimeError("Non hai entidades con VisibleNaWeb activado; mantense o índice anterior")

    result.sort(key=lambda item: (item["orde"], item["nome"]))
    return result


def upload_logos(client: Any, files: list[Path]) -> None:
    for path in files:
        key = f"{R2_PREFIX}{path.name}"
        data = path.read_bytes()
        client.put_object(
            Bucket=PUBLIC_BUCKET,
            Key=key,
            Body=data,
            ContentLength=len(data),
            ContentType="image/png",
            CacheControl="public, max-age=31536000, immutable",
        )
        head = client.head_object(Bucket=PUBLIC_BUCKET, Key=key)
        if int(head.get("ContentLength", -1)) != len(data):
            raise RuntimeError(f"Verificación de tamaño fallida para {key}")
        print(f"R2 OK {path.name} -> {PUBLIC_BUCKET}/{key} ({len(data)} bytes)")


def head_index(client: Any) -> dict[str, Any] | None:
    try:
        return client.head_object(Bucket=PUBLIC_BUCKET, Key=INDEX_KEY)
    except ClientError as exc:
        code = text(exc.response.get("Error", {}).get("Code"))
        if code in {"404", "NoSuchKey", "NotFound"}:
            return None
        raise


def publish_index(client: Any, entities: list[dict[str, Any]]) -> bool:
    now = datetime.now(timezone.utc)
    payload = {
        "ok": True,
        "version": 1,
        "xeradoEn": now.isoformat(),
        "xeradoEnMs": int(now.timestamp() * 1000),
        "orixe": "SHEET_COLABORACIONS_R2",
        "total": len(entities),
        "entidades": entities,
    }

    data_raw = json.dumps(entities, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")
    data_sha = hashlib.sha256(data_raw).hexdigest()
    current = head_index(client)
    if current and text(current.get("Metadata", {}).get("data-sha256")) == data_sha:
        print(f"Índice sen cambios: s3://{PUBLIC_BUCKET}/{INDEX_KEY}")
        return False

    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    body_sha = hashlib.sha256(raw).hexdigest()
    client.put_object(
        Bucket=PUBLIC_BUCKET,
        Key=INDEX_KEY,
        Body=raw,
        ContentType="application/json; charset=utf-8",
        CacheControl="public, max-age=300",
        Metadata={
            "data-sha256": data_sha,
            "body-sha256": body_sha,
            "scpp-source": "sheet-colaboracions-r2",
            "scpp-generated-at": str(payload["xeradoEnMs"]),
        },
    )

    verified = head_index(client)
    metadata = verified.get("Metadata", {}) if verified else {}
    if not verified or int(verified.get("ContentLength", 0)) != len(raw) or text(metadata.get("body-sha256")) != body_sha:
        raise RuntimeError(f"Fallou a verificación de s3://{PUBLIC_BUCKET}/{INDEX_KEY}")

    print(f"Publicado: s3://{PUBLIC_BUCKET}/{INDEX_KEY} ({len(raw)} bytes, {len(entities)} entidades)")
    return True


def main() -> int:
    files = sorted(SOURCE_DIR.glob("*.png"))
    if not files:
        raise RuntimeError(f"Non hai PNG para sincronizar en {SOURCE_DIR}")

    rows, _ = load_sheet_rows()
    entities = build_entities(rows, {path.name for path in files})
    client = r2_client()
    upload_logos(client, files)
    changed = publish_index(client, entities)
    print(json.dumps({"entidadesPublicas": len(entities), "logos": len(files), "indiceActualizado": changed}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"ERRO: {exc}", file=sys.stderr)
        raise SystemExit(1)
