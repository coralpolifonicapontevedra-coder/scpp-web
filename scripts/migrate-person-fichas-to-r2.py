#!/usr/bin/env python3
"""Migra as fichas de Persoas desde Drive a R2 e actualiza a Sheet tras verificación."""
from __future__ import annotations

import csv
import hashlib
import io
import json
import mimetypes
import os
import pathlib
import re
import sys
import tempfile
import unicodedata
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

SCOPES = [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/spreadsheets",
]
PERSOAS_ID = os.getenv("PERSOAS_SPREADSHEET_ID", "13-WeSz69A50XxPP57HA64Nascx6kXQFbeVKron0wATQ")
PERSOAS_TAB = os.getenv("PERSOAS_TAB", "Persoas")
FICHAS_FOLDER_ID = os.getenv("FICHAS_FOLDER_ID", "1UmEo1fP5jyxxo90dQbXG6SM2SrmdysbN")
REPORT_PATH = pathlib.Path(os.getenv("REPORT_PATH", "r2-fichas-migration-report.csv"))
R2_COLUMNS = [
    "FichaR2Key", "FichaR2ETag", "FichaR2SHA256", "FichaR2Size",
    "FichaR2MimeType", "FichaR2Estado", "FichaR2Actualizada", "FichaR2Erro",
]


def required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Falta a variable obrigatoria {name}")
    return value


def credentials():
    return service_account.Credentials.from_service_account_info(
        json.loads(required("GOOGLE_SERVICE_ACCOUNT_JSON")), scopes=SCOPES
    )


def canon(value) -> str:
    text = str(value or "").strip()
    try:
        return str(int(float(text)))
    except (TypeError, ValueError):
        return text


def basename(value) -> str:
    return pathlib.PurePosixPath(str(value or "").replace("\\", "/")).name


def slug(filename: str) -> str:
    path = pathlib.PurePosixPath(filename)
    stem = unicodedata.normalize("NFD", path.stem)
    stem = "".join(ch for ch in stem if unicodedata.category(ch) != "Mn").lower()
    stem = re.sub(r"[^a-z0-9]+", "-", stem).strip("-")
    return f"{stem}{path.suffix.lower() or '.pdf'}"


def r2_key(record_id: str, source_name: str) -> str:
    return f"persoas/fichas/{record_id}-{slug(source_name)}"


def col_letter(index: int) -> str:
    out, number = "", index + 1
    while number:
        number, rest = divmod(number - 1, 26)
        out = chr(65 + rest) + out
    return out


def get_values(sheets):
    return sheets.spreadsheets().values().get(
        spreadsheetId=PERSOAS_ID,
        range=f"{PERSOAS_TAB}!A:ZZ",
        valueRenderOption="FORMATTED_VALUE",
    ).execute().get("values", [])


def ensure_headers(sheets, values):
    if not values:
        raise RuntimeError("A folla Persoas non ten cabeceiras")
    headers = [str(v).strip() for v in values[0]]
    changed = False
    for name in R2_COLUMNS:
        if name not in headers:
            headers.append(name)
            changed = True
    if changed:
        sheets.spreadsheets().values().update(
            spreadsheetId=PERSOAS_ID,
            range=f"{PERSOAS_TAB}!A1:{col_letter(len(headers)-1)}1",
            valueInputOption="RAW",
            body={"values": [headers]},
        ).execute()
    return headers


def list_folder_files(drive, folder_id: str):
    index, pending = {}, [folder_id]
    while pending:
        current, token = pending.pop(), None
        while True:
            response = drive.files().list(
                q=f"'{current}' in parents and trashed = false",
                fields="nextPageToken,files(id,name,mimeType,size)",
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


def download_file(drive, file_id: str, destination: pathlib.Path):
    request = drive.files().get_media(fileId=file_id, supportsAllDrives=True)
    buffer = io.BytesIO()
    downloader = MediaIoBaseDownload(buffer, request, chunksize=8 * 1024 * 1024)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    data = buffer.getvalue()
    destination.write_bytes(data)
    return len(data), hashlib.sha256(data).hexdigest()


def r2_client():
    account = required("R2_ACCOUNT_ID")
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
        aws_access_key_id=required("R2_ACCESS_KEY_ID"),
        aws_secret_access_key=required("R2_SECRET_ACCESS_KEY"),
        region_name="auto",
    )


def head(client, bucket: str, key: str):
    try:
        return client.head_object(Bucket=bucket, Key=key)
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") in {"404", "NoSuchKey", "NotFound"}:
            return None
        raise


def write_metadata(sheets, headers, row: int, metadata: dict):
    data = []
    for field in R2_COLUMNS:
        data.append({
            "range": f"{PERSOAS_TAB}!{col_letter(headers.index(field))}{row}",
            "values": [[metadata.get(field, "")]],
        })
    sheets.spreadsheets().values().batchUpdate(
        spreadsheetId=PERSOAS_ID,
        body={"valueInputOption": "RAW", "data": data},
    ).execute()


def error_metadata(key: str, state: str, detail: str):
    return {
        "FichaR2Key": key,
        "FichaR2Estado": state,
        "FichaR2Actualizada": datetime.now(timezone.utc).isoformat(),
        "FichaR2Erro": detail,
    }


def main() -> int:
    mode = os.getenv("MIGRATION_MODE", "plan").strip().lower()
    if mode not in {"plan", "upload"}:
        raise RuntimeError("MIGRATION_MODE debe ser plan ou upload")

    creds = credentials()
    drive = build("drive", "v3", credentials=creds, cache_discovery=False)
    sheets = build("sheets", "v4", credentials=creds, cache_discovery=False)
    client, bucket = r2_client(), required("R2_BUCKET")
    values = get_values(sheets)
    headers = ensure_headers(sheets, values) if mode == "upload" else [str(v).strip() for v in values[0]]
    for name in ("Id", "Ficha"):
        if name not in headers:
            raise RuntimeError(f"Falta a columna {name} en Persoas")

    folder_index = list_folder_files(drive, FICHAS_FOLDER_ID)
    id_index, ficha_index = headers.index("Id"), headers.index("Ficha")
    counters = {"planned": 0, "uploaded": 0, "verified": 0, "skipped": 0, "errors": 0}
    fields = ["row", "record_id", "source_name", "r2_key", "status", "size", "sha256", "etag", "detail"]

    with REPORT_PATH.open("w", newline="", encoding="utf-8") as report:
        writer = csv.DictWriter(report, fieldnames=fields)
        writer.writeheader()
        for row_number, raw in enumerate(values[1:], start=2):
            padded = list(raw) + [""] * (len(headers) - len(raw))
            record_id, source_name = canon(padded[id_index]), basename(padded[ficha_index])
            if not record_id or not source_name:
                counters["skipped"] += 1
                continue
            key = r2_key(record_id, source_name)
            base = {"row": row_number, "record_id": record_id, "source_name": source_name, "r2_key": key, "size": "", "sha256": "", "etag": "", "detail": ""}
            matches = folder_index.get(source_name, [])
            if not matches or len(matches) > 1:
                status = "ERROR_SOURCE_NOT_FOUND" if not matches else "ERROR_SOURCE_AMBIGUOUS"
                detail = "Non aparece na carpeta mestra" if not matches else f"{len(matches)} ficheiros co mesmo nome"
                writer.writerow({**base, "status": status, "detail": detail})
                counters["errors"] += 1
                if mode == "upload":
                    write_metadata(sheets, headers, row_number, error_metadata(key, "ERRO", detail))
                continue

            source = matches[0]
            source_size = int(source.get("size", 0) or 0)
            remote = head(client, bucket, key)
            if mode == "plan":
                writer.writerow({**base, "status": "PLANNED_VERIFY_EXISTING" if remote else "PLANNED_UPLOAD", "size": source_size, "etag": str(remote.get("ETag", "")).strip('"') if remote else ""})
                counters["planned"] += 1
                continue

            with tempfile.TemporaryDirectory(prefix="scpp-fichas-r2-") as tmp:
                local = pathlib.Path(tmp) / source_name
                actual_size, sha256 = download_file(drive, source["id"], local)
                mime = mimetypes.guess_type(source_name)[0] or "application/pdf"
                if source_size and source_size != actual_size:
                    detail = f"Drive indicou {source_size}; descargáronse {actual_size}"
                    writer.writerow({**base, "status": "ERROR_DOWNLOAD_SIZE", "size": actual_size, "sha256": sha256, "detail": detail})
                    counters["errors"] += 1
                    write_metadata(sheets, headers, row_number, error_metadata(key, "ERRO", detail))
                    continue

                if remote:
                    remote_size = int(remote.get("ContentLength", -1))
                    remote_sha = (remote.get("Metadata") or {}).get("sha256", "")
                    if remote_size != actual_size or (remote_sha and remote_sha != sha256):
                        detail = "Existe en R2 con contido distinto; non se sobrescribe"
                        writer.writerow({**base, "status": "ERROR_REMOTE_CONFLICT", "size": remote_size, "sha256": remote_sha, "etag": str(remote.get("ETag", "")).strip('"'), "detail": detail})
                        counters["errors"] += 1
                        write_metadata(sheets, headers, row_number, error_metadata(key, "CONFLITO", detail))
                        continue
                    verified, status = remote, "VERIFIED_EXISTING"
                    counters["verified"] += 1
                else:
                    with local.open("rb") as body:
                        client.put_object(
                            Bucket=bucket,
                            Key=key,
                            Body=body,
                            ContentLength=actual_size,
                            ContentType=mime,
                            Metadata={"sha256": sha256, "source-drive-id": source["id"], "record-id": record_id, "asset-type": "persoa-ficha"},
                        )
                    verified, status = head(client, bucket, key), "UPLOADED_VERIFIED"
                    counters["uploaded"] += 1

                if not verified or int(verified.get("ContentLength", -1)) != actual_size or (verified.get("Metadata") or {}).get("sha256", "") != sha256:
                    detail = "A verificación posterior non coincide"
                    writer.writerow({**base, "status": "ERROR_VERIFY", "detail": detail})
                    counters["errors"] += 1
                    write_metadata(sheets, headers, row_number, error_metadata(key, "ERRO", detail))
                    continue

                etag = str(verified.get("ETag", "")).strip('"')
                write_metadata(sheets, headers, row_number, {
                    "FichaR2Key": key,
                    "FichaR2ETag": etag,
                    "FichaR2SHA256": sha256,
                    "FichaR2Size": actual_size,
                    "FichaR2MimeType": mime,
                    "FichaR2Estado": "SINCRONIZADO",
                    "FichaR2Actualizada": datetime.now(timezone.utc).isoformat(),
                    "FichaR2Erro": "",
                })
                writer.writerow({**base, "status": status, "size": actual_size, "sha256": sha256, "etag": etag})

    print(" | ".join(f"{k}={v}" for k, v in counters.items()))
    print(f"Informe: {REPORT_PATH}")
    return 1 if counters["errors"] else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
