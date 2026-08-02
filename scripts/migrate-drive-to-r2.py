#!/usr/bin/env python3
"""Migración conservadora de audios y partituras desde Google Drive a Cloudflare R2.

Principios de seguridad:
- El modo predeterminado es PLAN: no sube ni modifica nada.
- Nunca elimina objetos.
- Nunca sobrescribe un objeto existente.
- Verifica tamaño y SHA-256 tras cada subida.
- Genera un informe CSV para revisión.
- No modifica las hojas de cálculo; esa actualización se hará en una fase posterior.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import mimetypes
import os
import pathlib
import sys
import tempfile
from dataclasses import dataclass
from typing import Iterable

import boto3
from botocore.exceptions import ClientError
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

SCOPES = [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/spreadsheets.readonly",
]

AUDIO_SHEET_ID = os.getenv("AUDIO_SHEET_ID", "16BNPPni5BxowBsdGcvATj-zhYNLJYwjWoy2Zqtdu6i0")
AUDIO_TAB = os.getenv("AUDIO_TAB", "AudiosRepertorio")
PARTITURA_SHEET_ID = os.getenv("PARTITURA_SHEET_ID", "18KCxQC7UnplDjPoAq2w4EgD8vGZ5G2JDAKvuXIewet0")
PARTITURA_TAB = os.getenv("PARTITURA_TAB", "Partituras_App")
AUDIO_FOLDER_ID = os.getenv("AUDIO_FOLDER_ID", "1QAt_iu_C2m7jfoTfC9dh5SePWNf0iULU")
PARTITURA_FOLDER_ID = os.getenv("PARTITURA_FOLDER_ID", "1ZbqnD4Gda7gkJrQOLE-eNhiLboz7iqJm")


@dataclass(frozen=True)
class Item:
    category: str
    record_id: str
    source_path: str
    source_name: str
    r2_key: str


def required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Falta la variable obligatoria {name}")
    return value


def credentials():
    raw = required_env("GOOGLE_SERVICE_ACCOUNT_JSON")
    try:
        info = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError("GOOGLE_SERVICE_ACCOUNT_JSON no contiene JSON válido") from exc
    return service_account.Credentials.from_service_account_info(info, scopes=SCOPES)


def sheet_rows(sheets, spreadsheet_id: str, tab: str) -> list[dict[str, str]]:
    result = sheets.spreadsheets().values().get(
        spreadsheetId=spreadsheet_id,
        range=f"{tab}!A:Z",
        valueRenderOption="FORMATTED_VALUE",
    ).execute()
    values = result.get("values", [])
    if not values:
        return []
    headers = [str(v).strip() for v in values[0]]
    rows: list[dict[str, str]] = []
    for raw in values[1:]:
        padded = list(raw) + [""] * (len(headers) - len(raw))
        rows.append(dict(zip(headers, (str(v).strip() for v in padded))))
    return rows


def basename_from_sheet_path(value: str) -> str:
    return pathlib.PurePosixPath(value.replace("\\", "/")).name


def audio_items(rows: Iterable[dict[str, str]]) -> list[Item]:
    items: list[Item] = []
    for row in rows:
        if row.get("Activo", "").upper() not in {"Y", "SI", "SÍ", "TRUE"}:
            continue
        source_path = row.get("AudioFile", "")
        key = row.get("R2Key", "")
        if not source_path or not key:
            continue
        items.append(Item(
            category="audio",
            record_id=row.get("Id_Audio", ""),
            source_path=source_path,
            source_name=basename_from_sheet_path(source_path),
            r2_key=key.lstrip("/"),
        ))
    return items


def partitura_items(rows: Iterable[dict[str, str]]) -> list[Item]:
    items: list[Item] = []
    for row in rows:
        if row.get("Activa", "").upper() not in {"Y", "SI", "SÍ", "TRUE"}:
            continue
        source_path = row.get("PDF", "")
        if not source_path:
            continue
        name = basename_from_sheet_path(source_path)
        # Clave estable y legible. Conservamos el nombre existente para no romper referencias.
        key = f"partituras/{name}"
        items.append(Item(
            category="partitura",
            record_id=row.get("Id_Partitura", ""),
            source_path=source_path,
            source_name=name,
            r2_key=key,
        ))
    return items


def list_folder_files(drive, folder_id: str) -> dict[str, list[dict]]:
    """Indexa recursivamente por nombre; conserva duplicados para detectar ambigüedad."""
    index: dict[str, list[dict]] = {}
    pending = [folder_id]
    while pending:
        current = pending.pop()
        token = None
        while True:
            response = drive.files().list(
                q=f"'{current}' in parents and trashed = false",
                fields="nextPageToken, files(id,name,mimeType,size,md5Checksum)",
                pageSize=1000,
                pageToken=token,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
            ).execute()
            for entry in response.get("files", []):
                if entry.get("mimeType") == "application/vnd.google-apps.folder":
                    pending.append(entry["id"])
                else:
                    index.setdefault(entry["name"], []).append(entry)
            token = response.get("nextPageToken")
            if not token:
                break
    return index


def download_file(drive, file_id: str, destination: pathlib.Path) -> tuple[int, str]:
    request = drive.files().get_media(fileId=file_id, supportsAllDrives=True)
    digest = hashlib.sha256()
    size = 0
    with destination.open("wb") as out:
        buffer = io.BytesIO()
        downloader = MediaIoBaseDownload(buffer, request, chunksize=8 * 1024 * 1024)
        done = False
        while not done:
            _, done = downloader.next_chunk()
        data = buffer.getvalue()
        out.write(data)
        digest.update(data)
        size = len(data)
    return size, digest.hexdigest()


def r2_client():
    account_id = required_env("R2_ACCOUNT_ID")
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=required_env("R2_ACCESS_KEY_ID"),
        aws_secret_access_key=required_env("R2_SECRET_ACCESS_KEY"),
        region_name="auto",
    )


def existing_object(client, bucket: str, key: str):
    try:
        return client.head_object(Bucket=bucket, Key=key)
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") in {"404", "NoSuchKey", "NotFound"}:
            return None
        raise


def main() -> int:
    mode = os.getenv("MIGRATION_MODE", "plan").strip().lower()
    if mode not in {"plan", "upload"}:
        raise RuntimeError("MIGRATION_MODE debe ser plan o upload")

    creds = credentials()
    drive = build("drive", "v3", credentials=creds, cache_discovery=False)
    sheets = build("sheets", "v4", credentials=creds, cache_discovery=False)

    items = audio_items(sheet_rows(sheets, AUDIO_SHEET_ID, AUDIO_TAB))
    items += partitura_items(sheet_rows(sheets, PARTITURA_SHEET_ID, PARTITURA_TAB))

    audio_index = list_folder_files(drive, AUDIO_FOLDER_ID)
    score_index = list_folder_files(drive, PARTITURA_FOLDER_ID)

    client = r2_client()
    bucket = required_env("R2_BUCKET")
    report_path = pathlib.Path(os.getenv("REPORT_PATH", "r2-migration-report.csv"))

    errors = 0
    uploaded = 0
    verified = 0
    planned = 0

    with report_path.open("w", newline="", encoding="utf-8") as report:
        writer = csv.DictWriter(report, fieldnames=[
            "category", "record_id", "source_name", "r2_key", "status", "size", "sha256", "detail"
        ])
        writer.writeheader()

        for item in items:
            index = audio_index if item.category == "audio" else score_index
            matches = index.get(item.source_name, [])
            base = {
                "category": item.category,
                "record_id": item.record_id,
                "source_name": item.source_name,
                "r2_key": item.r2_key,
                "size": "",
                "sha256": "",
                "detail": "",
            }

            if len(matches) == 0:
                writer.writerow({**base, "status": "ERROR_SOURCE_NOT_FOUND", "detail": "No aparece en la carpeta maestra"})
                errors += 1
                continue
            if len(matches) > 1:
                writer.writerow({**base, "status": "ERROR_SOURCE_AMBIGUOUS", "detail": f"{len(matches)} archivos con el mismo nombre"})
                errors += 1
                continue

            source = matches[0]
            source_size = int(source.get("size", 0) or 0)
            head = existing_object(client, bucket, item.r2_key)
            if head is not None:
                remote_size = int(head.get("ContentLength", -1))
                remote_sha = (head.get("Metadata") or {}).get("sha256", "")
                if remote_size == source_size and remote_sha:
                    writer.writerow({**base, "status": "VERIFIED_EXISTING", "size": remote_size, "sha256": remote_sha})
                    verified += 1
                else:
                    writer.writerow({**base, "status": "ERROR_REMOTE_CONFLICT", "size": remote_size,
                                     "sha256": remote_sha, "detail": "Existe en R2 y no se sobrescribe"})
                    errors += 1
                continue

            if mode == "plan":
                writer.writerow({**base, "status": "PLANNED", "size": source_size})
                planned += 1
                continue

            suffix = pathlib.Path(item.source_name).suffix
            with tempfile.TemporaryDirectory(prefix="scpp-r2-") as tmp:
                local = pathlib.Path(tmp) / f"source{suffix}"
                actual_size, sha256 = download_file(drive, source["id"], local)
                if source_size and actual_size != source_size:
                    writer.writerow({**base, "status": "ERROR_DOWNLOAD_SIZE", "size": actual_size,
                                     "sha256": sha256, "detail": f"Drive indicó {source_size}"})
                    errors += 1
                    continue

                mime = mimetypes.guess_type(item.source_name)[0] or "application/octet-stream"
                with local.open("rb") as body:
                    client.put_object(
                        Bucket=bucket,
                        Key=item.r2_key,
                        Body=body,
                        ContentLength=actual_size,
                        ContentType=mime,
                        Metadata={"sha256": sha256, "source-drive-id": source["id"]},
                    )

                check = client.head_object(Bucket=bucket, Key=item.r2_key)
                check_size = int(check.get("ContentLength", -1))
                check_sha = (check.get("Metadata") or {}).get("sha256", "")
                if check_size != actual_size or check_sha != sha256:
                    writer.writerow({**base, "status": "ERROR_VERIFY", "size": check_size,
                                     "sha256": check_sha, "detail": "La verificación posterior no coincide"})
                    errors += 1
                    continue

                writer.writerow({**base, "status": "UPLOADED_VERIFIED", "size": actual_size, "sha256": sha256})
                uploaded += 1

    print(f"Modo={mode} | elementos={len(items)} | planificados={planned} | subidos={uploaded} | existentes_verificados={verified} | errores={errors}")
    print(f"Informe: {report_path}")
    return 1 if errors else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
