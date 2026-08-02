#!/usr/bin/env python3
"""Migración conservadora de recursos desde Drive a Cloudflare R2.

- Incluye todos los audios activos, también los registros antiguos.
- Genera R2Key cuando la fila todavía no la tiene.
- Nunca elimina ni sobrescribe objetos existentes.
- Verifica tamaño y SHA-256 tras cada subida.
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
import unicodedata
from dataclasses import dataclass
from typing import Iterable

import boto3
from botocore.exceptions import ClientError
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

SCOPES = ["https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/spreadsheets.readonly"]
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
    source_name: str
    r2_key: str

def required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Falta la variable obligatoria {name}")
    return value

def credentials():
    return service_account.Credentials.from_service_account_info(json.loads(required_env("GOOGLE_SERVICE_ACCOUNT_JSON")), scopes=SCOPES)

def sheet_rows(sheets, spreadsheet_id: str, tab: str) -> list[dict[str, str]]:
    values = sheets.spreadsheets().values().get(spreadsheetId=spreadsheet_id, range=f"{tab}!A:Z", valueRenderOption="FORMATTED_VALUE").execute().get("values", [])
    if not values:
        return []
    headers = [str(v).strip() for v in values[0]]
    result = []
    for raw in values[1:]:
        padded = list(raw) + [""] * (len(headers) - len(raw))
        result.append(dict(zip(headers, (str(v).strip() for v in padded))))
    return result

def truthy(value: str) -> bool:
    return str(value or "").strip().upper() in {"Y", "SI", "SÍ", "TRUE"}

def canon(value: str) -> str:
    value = str(value or "").strip()
    try:
        return str(int(float(value)))
    except (TypeError, ValueError):
        return value

def basename(value: str) -> str:
    return pathlib.PurePosixPath(str(value or "").replace("\\", "/")).name

def slug_filename(filename: str) -> str:
    path = pathlib.PurePosixPath(filename)
    stem = unicodedata.normalize("NFD", path.stem)
    stem = "".join(ch for ch in stem if unicodedata.category(ch) != "Mn").lower()
    chars, dashed = [], False
    for ch in stem:
        if ch.isalnum():
            chars.append(ch); dashed = False
        elif not dashed:
            chars.append("-"); dashed = True
    return f"{''.join(chars).strip('-')}{path.suffix.lower()}"

def audio_items(rows: Iterable[dict[str, str]]) -> list[Item]:
    items = []
    for row in rows:
        if not truthy(row.get("Activo")):
            continue
        record_id = canon(row.get("Id_Audio"))
        work_id = canon(row.get("NomeObra"))
        source_name = basename(row.get("AudioFile"))
        if not record_id or not work_id or not source_name:
            continue
        key = str(row.get("R2Key") or "").strip().lstrip("/") or f"repertorio/audios/{work_id}/{slug_filename(source_name)}"
        items.append(Item("audio", record_id, source_name, key))
    return items

def partitura_items(rows: Iterable[dict[str, str]]) -> list[Item]:
    items = []
    for row in rows:
        if not truthy(row.get("Activa")):
            continue
        record_id = canon(row.get("Id_Partitura"))
        source_name = basename(row.get("PDF"))
        if record_id and source_name:
            key = str(row.get("R2Key") or "").strip().lstrip("/") or f"partituras/{source_name}"
            items.append(Item("partitura", record_id, source_name, key))
    return items

def list_folder_files(drive, folder_id: str) -> dict[str, list[dict]]:
    index, pending = {}, [folder_id]
    while pending:
        current = pending.pop(); token = None
        while True:
            response = drive.files().list(q=f"'{current}' in parents and trashed = false", fields="nextPageToken,files(id,name,mimeType,size)", pageSize=1000, pageToken=token, supportsAllDrives=True, includeItemsFromAllDrives=True).execute()
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
    buffer = io.BytesIO(); downloader = MediaIoBaseDownload(buffer, request, chunksize=8 * 1024 * 1024); done = False
    while not done:
        _, done = downloader.next_chunk()
    data = buffer.getvalue(); destination.write_bytes(data)
    return len(data), hashlib.sha256(data).hexdigest()

def r2_client():
    account_id = required_env("R2_ACCOUNT_ID")
    return boto3.client("s3", endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com", aws_access_key_id=required_env("R2_ACCESS_KEY_ID"), aws_secret_access_key=required_env("R2_SECRET_ACCESS_KEY"), region_name="auto")

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
    creds = credentials(); drive = build("drive", "v3", credentials=creds, cache_discovery=False); sheets = build("sheets", "v4", credentials=creds, cache_discovery=False)
    items = audio_items(sheet_rows(sheets, AUDIO_SHEET_ID, AUDIO_TAB)) + partitura_items(sheet_rows(sheets, PARTITURA_SHEET_ID, PARTITURA_TAB))
    audio_index = list_folder_files(drive, AUDIO_FOLDER_ID); score_index = list_folder_files(drive, PARTITURA_FOLDER_ID)
    client = r2_client(); bucket = required_env("R2_BUCKET"); report_path = pathlib.Path(os.getenv("REPORT_PATH", "r2-migration-report.csv"))
    errors = uploaded = verified = planned = 0
    with report_path.open("w", newline="", encoding="utf-8") as report:
        writer = csv.DictWriter(report, fieldnames=["category","record_id","source_name","r2_key","status","size","sha256","detail"]); writer.writeheader()
        for item in items:
            index = audio_index if item.category == "audio" else score_index
            matches = index.get(item.source_name, [])
            base = {"category":item.category,"record_id":item.record_id,"source_name":item.source_name,"r2_key":item.r2_key,"size":"","sha256":"","detail":""}
            if not matches:
                writer.writerow({**base,"status":"ERROR_SOURCE_NOT_FOUND","detail":"No aparece en la carpeta maestra"}); errors += 1; continue
            if len(matches) > 1:
                writer.writerow({**base,"status":"ERROR_SOURCE_AMBIGUOUS","detail":f"{len(matches)} archivos con el mismo nombre"}); errors += 1; continue
            source = matches[0]; source_size = int(source.get("size", 0) or 0); head = existing_object(client, bucket, item.r2_key)
            if head is not None:
                remote_size = int(head.get("ContentLength", -1)); remote_sha = (head.get("Metadata") or {}).get("sha256", "")
                if remote_size == source_size:
                    writer.writerow({**base,"status":"VERIFIED_EXISTING","size":remote_size,"sha256":remote_sha}); verified += 1
                else:
                    writer.writerow({**base,"status":"ERROR_REMOTE_CONFLICT","size":remote_size,"sha256":remote_sha,"detail":"Existe en R2 y no se sobrescribe"}); errors += 1
                continue
            if mode == "plan":
                writer.writerow({**base,"status":"PLANNED","size":source_size}); planned += 1; continue
            with tempfile.TemporaryDirectory(prefix="scpp-r2-") as tmp:
                local = pathlib.Path(tmp) / f"source{pathlib.Path(item.source_name).suffix}"
                actual_size, sha256 = download_file(drive, source["id"], local)
                if source_size and actual_size != source_size:
                    writer.writerow({**base,"status":"ERROR_DOWNLOAD_SIZE","size":actual_size,"sha256":sha256,"detail":f"Drive indicó {source_size}"}); errors += 1; continue
                mime = mimetypes.guess_type(item.source_name)[0] or "application/octet-stream"
                with local.open("rb") as body:
                    client.put_object(Bucket=bucket, Key=item.r2_key, Body=body, ContentLength=actual_size, ContentType=mime, Metadata={"sha256":sha256,"source-drive-id":source["id"],"record-id":item.record_id})
                check = client.head_object(Bucket=bucket, Key=item.r2_key)
                if int(check.get("ContentLength", -1)) != actual_size or (check.get("Metadata") or {}).get("sha256", "") != sha256:
                    writer.writerow({**base,"status":"ERROR_VERIFY","detail":"La verificación posterior no coincide"}); errors += 1; continue
                writer.writerow({**base,"status":"UPLOADED_VERIFIED","size":actual_size,"sha256":sha256}); uploaded += 1
    print(f"Modo={mode} | elementos={len(items)} | planificados={planned} | subidos={uploaded} | existentes_verificados={verified} | errores={errors}")
    print(f"Informe: {report_path}")
    return 1 if errors else 0

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
