#!/usr/bin/env python3
"""Constrúe índices de concertos en R2 a partir das follas publicadas.

As fontes de Google só se consultan durante a sincronización. A navegación da
web le o último índice público válido desde R2 e nunca substitúe ese índice se
a extracción ou as validacións fallan.
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
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any



CONCERTOS_URL = os.getenv(
    "CONCERTOS_CSV_URL",
    "https://docs.google.com/spreadsheets/d/e/"
    "2PACX-1vSX8BEJ-hrubqEtaZ1zZaLSy7LoxaDQOuQuqR2ior7TZErtBGL5bJG0B_"
    "AK5Dp8eFeTDb3Pmpqh7Hnu/pub?gid=1098509641&single=true&output=csv",
)
PROGRAMAS_URL = os.getenv(
    "PROGRAMAS_CSV_URL",
    "https://docs.google.com/spreadsheets/d/e/"
    "2PACX-1vTMm4Z45Bcfz_-AEwcA6lNmttLAjJEOxXpTFmlnLwtRCoSIF7xlCP-"
    "LEdlfLoMYkbOnAefC7I9G9Cec/pub?gid=1925601694&single=true&output=csv",
)
REPERTORIO_URL = os.getenv(
    "REPERTORIO_CSV_URL",
    "https://docs.google.com/spreadsheets/d/e/"
    "2PACX-1vSuYtrIlKLbU1QkH7fP2zbKQQYFV6kvACLLFBZrJ7cC8t54jAsrTDWvL_"
    "x7fko9Hw71oKIoYyBcjNF3/pub?gid=984049442&single=true&output=csv",
)

PUBLIC_BUCKET = os.getenv("R2_PUBLIC_BUCKET", "scpp-publico").strip()
PRIVATE_BUCKET = os.getenv("R2_PRIVATE_BUCKET", "scpp-privado").strip()
PUBLIC_INDEX_KEY = "indices/concertos-v1.json"
PUBLIC_HISTORY_INDEX_KEY = "indices/concertos-historico-v1.json"
PRIVATE_INDEX_KEY = "indices/concertos-privado-v1.json"
ATTEMPTS = int(os.getenv("SYNC_ATTEMPTS", "5"))
TIMEOUT_SECONDS = int(os.getenv("SYNC_TIMEOUT_SECONDS", "90"))

REQUIRED_CONCERT_HEADERS = {
    "id",
    "data",
    "nome",
    "cidade",
    "lugar",
    "cartel",
    "triptico",
    "prensa",
    "hora",
    "mostrar_web",
    "destacado_web",
    "estado",
    "numeroconcerto",
    "ordehistorica",
    "datatextohistorica",
}


def required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Falta a variable obrigatoria {name}")
    return value


def text(value: Any = "") -> str:
    return str(value or "").strip()


def normalize(value: Any = "") -> str:
    raw = unicodedata.normalize("NFD", text(value))
    return "".join(ch for ch in raw if unicodedata.category(ch) != "Mn").lower()


def header_name(value: Any = "") -> str:
    return re.sub(r"\s+", "_", normalize(value))


def truthy(value: Any = "") -> bool:
    return normalize(value) in {"true", "si", "yes", "1", "y", "verdadeiro"}


def integer(value: Any = "") -> int | None:
    raw = text(value)
    if not raw:
        return None
    try:
        number = float(raw.replace(",", "."))
    except ValueError as exc:
        raise ValueError(f"Valor enteiro non válido: {raw}") from exc
    if not number.is_integer():
        raise ValueError(f"Agardábase un enteiro e chegou: {raw}")
    return int(number)


def iso_date(value: Any = "") -> str:
    raw = text(value)
    if not raw:
        return ""
    parts = raw.split("/") if "/" in raw else raw.split("-")
    if len(parts) != 3 or not all(part.strip().isdigit() for part in parts):
        raise ValueError(f"Data non válida: {raw}")
    first, month, last = [int(part) for part in parts]
    if first > 31:
        year, day = first, last
    else:
        day, year = first, last
    parsed = datetime(year, month, day)
    return parsed.strftime("%Y-%m-%d")


def row_value(row: dict[str, str], *names: str) -> str:
    for name in names:
        value = text(row.get(header_name(name)))
        if value:
            return value
    return ""


def parse_csv(content: str, label: str) -> tuple[list[dict[str, str]], set[str]]:
    reader = csv.DictReader(io.StringIO(content.lstrip("\ufeff")))
    if not reader.fieldnames:
        raise RuntimeError(f"A fonte {label} non ten cabeceiras")
    headers = {header_name(name) for name in reader.fieldnames if text(name)}
    rows = []
    for raw in reader:
        normalized = {
            header_name(key): text(value)
            for key, value in raw.items()
            if key is not None and text(key)
        }
        if any(normalized.values()):
            rows.append(normalized)
    if not rows:
        raise RuntimeError(f"A fonte {label} non contén rexistros")
    return rows, headers


def fetch_csv(url: str, label: str) -> tuple[list[dict[str, str]], set[str]]:
    import requests

    last_error: Exception | None = None
    for attempt in range(1, ATTEMPTS + 1):
        try:
            response = requests.get(
                url,
                headers={
                    "Accept": "text/csv",
                    "Cache-Control": "no-cache",
                    "User-Agent": "SCPP-Concertos-R2/1.0",
                },
                timeout=TIMEOUT_SECONDS,
            )
            response.raise_for_status()
            rows, headers = parse_csv(response.text, label)
            print(f"{label}: {len(rows)} filas no intento {attempt}")
            return rows, headers
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            print(
                f"Intento {attempt}/{ATTEMPTS} fallido para {label}: {exc}",
                file=sys.stderr,
            )
            if attempt < ATTEMPTS:
                time.sleep(min(attempt * 10, 30))
    raise RuntimeError(f"Non foi posible obter {label}: {last_error}")


def validate_headers(headers: set[str]) -> None:
    missing = sorted(REQUIRED_CONCERT_HEADERS - headers)
    if missing:
        raise RuntimeError("Faltan columnas en Concertos: " + ", ".join(missing))


def build_concerts(
    concert_rows: list[dict[str, str]],
    program_rows: list[dict[str, str]],
    repertoire_rows: list[dict[str, str]],
) -> list[dict[str, Any]]:
    works = {}
    for row in repertoire_rows:
        work_id = row_value(row, "Id", "Row ID")
        if work_id:
            works[work_id] = {
                "name": row_value(row, "Nome", "NomeObra", "Obra", "Título", "Titulo"),
                "author": row_value(row, "Autor", "Compositor"),
            }

    programs: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in program_rows:
        concert_id = row_value(row, "Id_Conciertos", "Id_Concertos")
        work_id = row_value(row, "Id_Obras")
        if not concert_id or not work_id:
            continue
        work = works.get(work_id, {})
        programs[concert_id].append(
            {
                "orde": integer(row_value(row, "Orde")) or 999,
                "obra": text(work.get("name")) or work_id,
                "autor": text(work.get("author")),
                "notas": row_value(row, "Notas"),
                "solista": row_value(row, "Solista"),
            }
        )
    for program in programs.values():
        program.sort(key=lambda item: item["orde"])

    concerts = []
    for row_number, row in enumerate(concert_rows, start=2):
        concert_id = row_value(row, "Id", "Row ID")
        if not concert_id:
            raise RuntimeError(f"Concertos fila {row_number}: falta Id")
        date = iso_date(row_value(row, "Data"))
        historical_date_text = row_value(row, "DataTextoHistorica")
        historical_number = row_value(row, "NumeroConcerto")
        historical_order = integer(row_value(row, "OrdeHistorica"))
        if historical_number and historical_order is None:
            raise RuntimeError(
                f"Concerto {concert_id}: ten NumeroConcerto pero non OrdeHistorica"
            )
        if historical_order is not None and not historical_number:
            raise RuntimeError(
                f"Concerto {concert_id}: ten OrdeHistorica pero non NumeroConcerto"
            )
        if historical_number and not date and not historical_date_text:
            raise RuntimeError(
                f"Concerto histórico {historical_number}: falta Data e DataTextoHistorica"
            )

        concerts.append(
            {
                "id": concert_id,
                "data": date,
                "nome": row_value(row, "Nome"),
                "cidade": row_value(row, "Cidade"),
                "lugar": row_value(row, "Lugar"),
                "caracteristicas": row_value(row, "Características", "Caracteristicas"),
                "cartel": row_value(row, "Cartel"),
                "triptico": row_value(row, "Triptico", "Tríptico"),
                "prensa": row_value(row, "Prensa"),
                "hora": row_value(row, "Hora"),
                "mostrarWeb": truthy(row_value(row, "Mostrar_Web")),
                "destacadoWeb": truthy(row_value(row, "Destacado_Web")),
                "estado": normalize(row_value(row, "Estado")),
                "numeroConcerto": historical_number,
                "ordeHistorica": historical_order,
                "dataTextoHistorica": historical_date_text,
                "programa": programs.get(concert_id, []),
            }
        )

    ids = [concert["id"] for concert in concerts]
    if len(ids) != len(set(ids)):
        raise RuntimeError("Hai Id técnicos duplicados na táboa Concertos")

    historical = [concert for concert in concerts if concert["numeroConcerto"]]
    historical_numbers = [concert["numeroConcerto"] for concert in historical]
    if len(historical_numbers) != len(set(historical_numbers)):
        raise RuntimeError("Hai NumeroConcerto duplicados")
    orders = sorted(int(concert["ordeHistorica"]) for concert in historical)
    if orders and orders != list(range(1, max(orders) + 1)):
        raise RuntimeError("OrdeHistorica non é correlativa desde 1")

    public = [concert for concert in concerts if concert["mostrarWeb"]]
    invalid_public = [concert["id"] for concert in public if not concert["data"] or not concert["nome"]]
    if invalid_public:
        raise RuntimeError(
            "Concertos públicos sen Data ou Nome: " + ", ".join(invalid_public)
        )
    if not public:
        raise RuntimeError("Non hai concertos con Mostrar_Web activado; mantense o índice anterior")
    return concerts


def index_payload(concerts: list[dict[str, Any]], public_only: bool) -> dict[str, Any]:
    selected = [concert for concert in concerts if concert["mostrarWeb"]] if public_only else concerts
    selected.sort(
        key=lambda concert: (
            concert["data"] or "9999-99-99",
            concert["ordeHistorica"] or 999999,
            concert["id"],
        )
    )
    historical = [concert for concert in concerts if concert["numeroConcerto"]]
    now = datetime.now(timezone.utc)
    return {
        "ok": True,
        "version": 1,
        "xeradoEn": now.isoformat(),
        "xeradoEnMs": int(now.timestamp() * 1000),
        "orixe": "GITHUB_ACTIONS_SHEETS_R2",
        "total": len(selected),
        "totalFonte": len(concerts),
        "totalHistorico": len(historical),
        "ordeHistoricaMax": max(
            (int(concert["ordeHistorica"]) for concert in historical),
            default=0,
        ),
        "concertos": selected,
    }


def historical_year(concert: dict[str, Any]) -> str:
    for value in (concert["data"], concert["dataTextoHistorica"]):
        match = re.search(r"\b(?:18|19|20)\d{2}\b", text(value))
        if match:
            return match.group(0)
    return ""


def history_payload(concerts: list[dict[str, Any]]) -> dict[str, Any]:
    """Constrúe unha vista pública mínima, sen programas nin campos internos."""
    selected = [
        {
            "id": concert["id"],
            "numeroConcerto": concert["numeroConcerto"],
            "ordeHistorica": concert["ordeHistorica"],
            "data": concert["data"],
            "dataTextoHistorica": concert["dataTextoHistorica"],
            "ano": historical_year(concert),
            "nome": concert["nome"],
            "cidade": concert["cidade"],
            "lugar": concert["lugar"],
            "descricion": concert["caracteristicas"],
        }
        for concert in concerts
        if concert["numeroConcerto"]
    ]
    selected.sort(
        key=lambda concert: (
            concert["ordeHistorica"] or 999999,
            concert["data"] or "9999-99-99",
            concert["id"],
        )
    )
    now = datetime.now(timezone.utc)
    years = {concert["ano"] for concert in selected if concert["ano"]}
    return {
        "ok": True,
        "version": 1,
        "xeradoEn": now.isoformat(),
        "xeradoEnMs": int(now.timestamp() * 1000),
        "orixe": "GITHUB_ACTIONS_SHEETS_R2",
        "total": len(selected),
        "totalAnos": len(years),
        "concertos": selected,
    }


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
        code = text(exc.response.get("Error", {}).get("Code"))
        if code in {"404", "NoSuchKey", "NotFound"}:
            return None
        raise


def publish_index(
    client: Any,
    bucket: str,
    key: str,
    payload: dict[str, Any],
    cache_control: str,
) -> bool:
    data_body = json.dumps(
        payload["concertos"], ensure_ascii=False, separators=(",", ":"), sort_keys=True
    ).encode("utf-8")
    data_sha = hashlib.sha256(data_body).hexdigest()
    current = head_object(client, bucket, key)
    if current and text(current.get("Metadata", {}).get("data-sha256")) == data_sha:
        print(f"Sen cambios: s3://{bucket}/{key}")
        return False

    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    body_sha = hashlib.sha256(body).hexdigest()
    client.put_object(
        Bucket=bucket,
        Key=key,
        Body=body,
        ContentType="application/json; charset=utf-8",
        CacheControl=cache_control,
        Metadata={
            "data-sha256": data_sha,
            "body-sha256": body_sha,
            "scpp-source": "github-actions-sheets-r2",
            "scpp-generated-at": str(payload["xeradoEnMs"]),
        },
    )
    verified = head_object(client, bucket, key)
    metadata = verified.get("Metadata", {}) if verified else {}
    if (
        not verified
        or int(verified.get("ContentLength", 0)) != len(body)
        or text(metadata.get("body-sha256")) != body_sha
    ):
        raise RuntimeError(f"Fallou a verificación de s3://{bucket}/{key}")
    print(f"Publicado: s3://{bucket}/{key} ({len(body)} bytes, {payload['total']} concertos)")
    return True


def run() -> int:
    concert_rows, concert_headers = fetch_csv(CONCERTOS_URL, "Concertos")
    program_rows, _ = fetch_csv(PROGRAMAS_URL, "ConcertosRepertorio")
    repertoire_rows, _ = fetch_csv(REPERTORIO_URL, "Repertorio")
    validate_headers(concert_headers)
    concerts = build_concerts(concert_rows, program_rows, repertoire_rows)

    public_payload = index_payload(concerts, public_only=True)
    history = history_payload(concerts)
    private_payload = index_payload(concerts, public_only=False)
    client = r2_client()

    private_changed = publish_index(
        client,
        PRIVATE_BUCKET,
        PRIVATE_INDEX_KEY,
        private_payload,
        "private, max-age=600",
    )
    public_changed = publish_index(
        client,
        PUBLIC_BUCKET,
        PUBLIC_INDEX_KEY,
        public_payload,
        "public, max-age=300",
    )
    history_changed = publish_index(
        client,
        PUBLIC_BUCKET,
        PUBLIC_HISTORY_INDEX_KEY,
        history,
        "public, max-age=300",
    )
    print(
        json.dumps(
            {
                "fonte": len(concerts),
                "historicos": private_payload["totalHistorico"],
                "ordeMaxima": private_payload["ordeHistoricaMax"],
                "publicos": public_payload["total"],
                "historicoPublico": history["total"],
                "anosHistoricos": history["totalAnos"],
                "indicePrivadoActualizado": private_changed,
                "indicePublicoActualizado": public_changed,
                "indiceHistoricoActualizado": history_changed,
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(run())
    except Exception as exc:  # noqa: BLE001
        print(f"ERRO: {exc}", file=sys.stderr)
        raise SystemExit(1)
