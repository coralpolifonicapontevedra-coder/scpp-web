#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import pathlib
import unicodedata
from collections import defaultdict

import boto3
from botocore.exceptions import ClientError
from google.oauth2 import service_account
from googleapiclient.discovery import build

SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]
AUDIO_SHEET_ID = "16BNPPni5BxowBsdGcvATj-zhYNLJYwjWoy2Zqtdu6i0"
PARTITURA_SHEET_ID = "18KCxQC7UnplDjPoAq2w4EgD8vGZ5G2JDAKvuXIewet0"
OUTPUT = pathlib.Path("functions/_data/repertorio-r2.js")
EXPECTED_AUDIOS = 239
EXPECTED_SCORES = 99


def credentials():
    raw = os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"]
    return service_account.Credentials.from_service_account_info(json.loads(raw), scopes=SCOPES)


def rows(sheets, spreadsheet_id: str, tab: str):
    values = sheets.spreadsheets().values().get(
        spreadsheetId=spreadsheet_id,
        range=f"{tab}!A:Z",
        valueRenderOption="FORMATTED_VALUE",
    ).execute().get("values", [])
    if not values:
        return []
    headers = [str(v).strip() for v in values[0]]
    result = []
    for raw in values[1:]:
        raw = list(raw) + [""] * (len(headers) - len(raw))
        result.append(dict(zip(headers, (str(v).strip() for v in raw))))
    return result


def canon(value: str) -> str:
    value = str(value or "").strip()
    try:
        return str(int(float(value)))
    except (TypeError, ValueError):
        return value


def truthy(value: str) -> bool:
    return str(value or "").strip().upper() in {"Y", "SI", "SÍ", "TRUE"}


def number(value: str, default=0):
    try:
        return int(float(str(value).replace(",", ".")))
    except (TypeError, ValueError):
        return default


def basename(value: str) -> str:
    return pathlib.PurePosixPath(str(value or "").replace("\\", "/")).name


def slug_filename(filename: str) -> str:
    path = pathlib.PurePosixPath(filename)
    stem = unicodedata.normalize("NFD", path.stem)
    stem = "".join(ch for ch in stem if unicodedata.category(ch) != "Mn").lower()
    chars = []
    previous_dash = False
    for ch in stem:
        if ch.isalnum():
            chars.append(ch)
            previous_dash = False
        elif not previous_dash:
            chars.append("-")
            previous_dash = True
    slug = "".join(chars).strip("-")
    return f"{slug}{path.suffix.lower()}"


def r2_client():
    account_id = os.environ["R2_ACCOUNT_ID"]
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def head(client, bucket: str, key: str):
    try:
        return client.head_object(Bucket=bucket, Key=key)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        if code in {"404", "NoSuchKey", "NotFound"}:
            return None
        raise


def main():
    sheets = build("sheets", "v4", credentials=credentials(), cache_discovery=False)
    audio_rows = rows(sheets, AUDIO_SHEET_ID, "AudiosRepertorio")
    score_rows = rows(sheets, PARTITURA_SHEET_ID, "Partituras_App")
    client = r2_client()
    bucket = os.environ["R2_BUCKET"]

    index = defaultdict(lambda: {"partituras": [], "audios": []})
    missing = []

    for row in audio_rows:
        record_id = canon(row.get("Id_Audio"))
        if not truthy(row.get("Activo")) or number(record_id, -1) < 176:
            continue
        raw_work_id = str(row.get("NomeObra") or "").strip()
        work_id = canon(raw_work_id)
        source_name = basename(row.get("AudioFile"))
        key = str(row.get("R2Key") or "").strip().lstrip("/")
        if not key:
            key = f"repertorio/audios/{raw_work_id}/{slug_filename(source_name)}"
        obj = head(client, bucket, key)
        if obj is None:
            missing.append(f"audio {record_id}: {key}")
            continue
        index[work_id]["audios"].append({
            "id": record_id,
            "nome": source_name,
            "voz": row.get("Voz") or "Audio",
            "tipo": row.get("TipoAudio") or "",
            "orde": number(row.get("Orde"), 999),
            "ruta": key,
            "r2Key": key,
            "mimeType": row.get("MimeType") or obj.get("ContentType") or "",
            "tamano": number(obj.get("ContentLength")),
        })

    for row in score_rows:
        if not truthy(row.get("Activa")):
            continue
        record_id = canon(row.get("Id_Partitura"))
        work_id = canon(row.get("Id_Repertorio"))
        source_name = basename(row.get("PDF"))
        key = str(row.get("R2Key") or "").strip().lstrip("/") or f"partituras/{source_name}"
        obj = head(client, bucket, key)
        if obj is None:
            missing.append(f"partitura {record_id}: {key}")
            continue
        index[work_id]["partituras"].append({
            "id": record_id,
            "nome": row.get("Nomepartitura") or source_name,
            "voz": row.get("Voz") or "General",
            "tipo": row.get("TipoPartitura") or "",
            "principal": truthy(row.get("Principal")),
            "ruta": key,
            "r2Key": key,
            "mimeType": "application/pdf",
            "tamano": number(obj.get("ContentLength")),
        })

    for work in index.values():
        work["audios"].sort(key=lambda x: (x["orde"], x["voz"], x["nome"]))
        work["partituras"].sort(key=lambda x: (not x["principal"], x["nome"]))

    total_audios = sum(len(x["audios"]) for x in index.values())
    total_scores = sum(len(x["partituras"]) for x in index.values())
    if missing or total_audios != EXPECTED_AUDIOS or total_scores != EXPECTED_SCORES:
        detalle = "\n".join(missing[:30])
        raise RuntimeError(
            f"Índice incompleto: audios={total_audios}/{EXPECTED_AUDIOS}, partituras={total_scores}/{EXPECTED_SCORES}, faltantes={len(missing)}"
            + (f"\n{detalle}" if detalle else "")
        )

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        "// Xerado automaticamente. Non editar a man.\n"
        "export const REPERTORIO_R2 = "
        + json.dumps(dict(index), ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print(f"Índice completo: {total_audios} audios, {total_scores} partituras, {len(index)} obras con recursos")


if __name__ == "__main__":
    main()
