#!/usr/bin/env python3
"""Migra Documentación y Actas desde Drive a R2 sin borrar ni sobrescribir conflictos."""

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
from dataclasses import dataclass
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
SPREADSHEET_ID = os.getenv("DOCUMENTACION_SPREADSHEET_ID", "1sAMi9TWZ7YwjOxu1a-KliO_7LtYlo4Zf2AowmPKDQX8")
DOCUMENTACION_FOLDER_ID = os.getenv("DOCUMENTACION_FOLDER_ID", "1T8izGJMWiWH0cSNHyKIDvSQZXtB2LgyQ")
ACTAS_FOLDER_ID = os.getenv("ACTAS_FOLDER_ID", "1dJpIGV-i6kvu6gTkeTphpz9uopvHO2MR")
MODE = os.getenv("MIGRATION_MODE", "plan").strip().lower()
REPORT_PATH = pathlib.Path(os.getenv("REPORT_PATH", "documentacion-r2-migration.csv"))
R2_COLUMNS = ["R2Key", "R2ETag", "R2SHA256", "R2Size", "R2MimeType", "R2Estado", "R2Actualizada", "R2Erro"]


@dataclass
class Item:
    tab: str
    row_number: int
    category: str
    record_id: str
    source_name: str
    r2_key: str


def required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Falta la variable {name}")
    return value


def service_account_info():
    info = json.loads(required("GOOGLE_SERVICE_ACCOUNT_JSON"))
    email = str(info.get("client_email", "")).strip()
    if not email:
        raise RuntimeError("GOOGLE_SERVICE_ACCOUNT_JSON no contiene client_email")
    return info


def credentials():
    info = service_account_info()
    print(f"Cuenta de servicio de Google: {info['client_email']}")
    return service_account.Credentials.from_service_account_info(info, scopes=SCOPES)


def slug(value: str) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn").lower()
    text = re.sub(r"[^a-z0-9._-]+", "-", text).strip("-.")
    return text or "arquivo"


def filename(value: str) -> str:
    return pathlib.PurePosixPath(str(value or "").replace("\\", "/")).name


def record_id(value: str) -> str:
    text = str(value or "").strip()
    try:
        return str(int(float(text.replace(",", "."))))
    except (TypeError, ValueError):
        return text


def key_for(category: str, rid: str, source: str) -> str:
    prefix = "documentacion/actas" if category == "acta" else "documentacion/documentos"
    return f"{prefix}/{slug(rid)}-{slug(source)}"


def sheet_data(sheets, tab: str):
    values = sheets.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f"'{tab}'!A:AZ",
        valueRenderOption="FORMATTED_VALUE",
    ).execute().get("values", [])
    if not values:
        return [], [], {}
    headers = [str(v).strip() for v in values[0]]
    mapping = {name: index for index, name in enumerate(headers)}
    return headers, values[1:], mapping


def ensure_grid_columns(sheets, tab: str, required_columns: int):
    response = sheets.spreadsheets().get(
        spreadsheetId=SPREADSHEET_ID,
        fields="sheets(properties(sheetId,title,gridProperties(columnCount)))",
    ).execute()
    properties = next(
        (
            entry.get("properties", {})
            for entry in response.get("sheets", [])
            if entry.get("properties", {}).get("title") == tab
        ),
        None,
    )
    if not properties:
        raise RuntimeError(f"No se encontró la pestaña {tab}")
    current_columns = int(
        properties.get("gridProperties", {}).get("columnCount", 0) or 0
    )
    if required_columns <= current_columns:
        return
    sheets.spreadsheets().batchUpdate(
        spreadsheetId=SPREADSHEET_ID,
        body={
            "requests": [
                {
                    "appendDimension": {
                        "sheetId": properties["sheetId"],
                        "dimension": "COLUMNS",
                        "length": required_columns - current_columns,
                    }
                }
            ]
        },
    ).execute()


def ensure_columns(sheets, tab: str, headers: list[str]):
    missing = [name for name in R2_COLUMNS if name not in headers]
    if MODE != "upload" or not missing:
        return headers
    ensure_grid_columns(sheets, tab, len(headers) + len(missing))
    start = len(headers) + 1
    sheets.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=f"'{tab}'!{column_name(start)}1",
        valueInputOption="RAW",
        body={"values": [missing]},
    ).execute()
    return headers + missing


def verify_sheet_write_access(sheets, tab: str, headers: list[str]):
    if not headers:
        raise RuntimeError(f"La hoja {tab} no tiene cabeceras")
    # Escritura inocua del mismo valor para comprobar permisos antes de tocar R2.
    sheets.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=f"'{tab}'!A1",
        valueInputOption="RAW",
        body={"values": [[headers[0]]]},
    ).execute()


def column_name(number: int) -> str:
    result = ""
    while number:
        number, rest = divmod(number - 1, 26)
        result = chr(65 + rest) + result
    return result


def items_from_tab(sheets, tab: str, category: str, source_column: str, id_columns: list[str]):
    headers, rows, mapping = sheet_data(sheets, tab)
    if not headers:
        return [], headers
    if source_column not in mapping:
        raise RuntimeError(f"La hoja {tab} no contiene {source_column}")
    found = []
    for row_number, raw in enumerate(rows, start=2):
        row = list(raw) + [""] * (len(headers) - len(raw))
        source = filename(row[mapping[source_column]])
        if not source:
            continue
        rid = ""
        for column in id_columns:
            if column in mapping:
                rid = record_id(row[mapping[column]])
                if rid:
                    break
        found.append(Item(tab, row_number, category, rid, source, key_for(category, rid, source) if rid else ""))
    return found, headers


def list_folder(drive, folder_id: str):
    index, pending = {}, [folder_id]
    while pending:
        parent = pending.pop()
        token = None
        while True:
            response = drive.files().list(
                q=f"'{parent}' in parents and trashed = false",
                fields="nextPageToken,files(id,name,mimeType,size,md5Checksum)",
                pageSize=1000,
                pageToken=token,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
            ).execute()
            for entry in response.get("files", []):
                if entry.get("mimeType") == "application/vnd.google-apps.folder":
                    pending.append(entry["id"])
                else:
                    index.setdefault(entry.get("name", ""), []).append(entry)
            token = response.get("nextPageToken")
            if not token:
                break
    return index


def r2_client():
    return boto3.client(
        "s3",
        endpoint_url=f"https://{required('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com",
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


def download(drive, file_id: str, destination: pathlib.Path):
    request = drive.files().get_media(fileId=file_id, supportsAllDrives=True)
    buffer = io.BytesIO()
    downloader = MediaIoBaseDownload(buffer, request, chunksize=8 * 1024 * 1024)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    data = buffer.getvalue()
    destination.write_bytes(data)
    return len(data), hashlib.sha256(data).hexdigest()


def metadata_from_existing(item: Item, source: dict, remote: dict):
    remote_metadata = remote.get("Metadata", {})
    source_size = int(source.get("size", 0) or 0)
    remote_size = int(remote.get("ContentLength", 0) or 0)
    sha256 = str(remote_metadata.get("sha256", "")).strip()
    same_origin = (
        str(remote_metadata.get("source-drive-id", "")).strip() == str(source.get("id", "")).strip()
        and str(remote_metadata.get("record-id", "")).strip() == item.record_id
    )
    if remote_size != source_size or not sha256 or not same_origin:
        return None
    updated = remote.get("LastModified")
    return {
        "R2Key": item.r2_key,
        "R2ETag": str(remote.get("ETag", "")).strip('"'),
        "R2SHA256": sha256,
        "R2Size": remote_size,
        "R2MimeType": remote.get("ContentType") or mimetypes.guess_type(item.source_name)[0] or "application/octet-stream",
        "R2Estado": "SINCRONIZADO",
        "R2Actualizada": updated.astimezone(timezone.utc).isoformat() if hasattr(updated, "astimezone") else datetime.now(timezone.utc).isoformat(),
        "R2Erro": "",
    }


def update_sheet(sheets, item: Item, headers: list[str], values: dict):
    headers = ensure_columns(sheets, item.tab, headers)
    start = headers.index(R2_COLUMNS[0]) + 1
    row = [values.get(name, "") for name in R2_COLUMNS]
    sheets.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=f"'{item.tab}'!{column_name(start)}{item.row_number}",
        valueInputOption="RAW",
        body={"values": [row]},
    ).execute()
    return headers


def run():
    if MODE not in {"plan", "upload"}:
        raise RuntimeError("MIGRATION_MODE debe ser plan o upload")
    creds = credentials()
    sheets = build("sheets", "v4", credentials=creds, cache_discovery=False)
    drive = build("drive", "v3", credentials=creds, cache_discovery=False)
    client, bucket = r2_client(), required("R2_BUCKET")
    docs, doc_headers = items_from_tab(sheets, "Documentación", "documento", "Ficheiro", ["Id_Documento", "Row ID"])
    minutes, minutes_headers = items_from_tab(sheets, "Actas XD e AX", "acta", "Acta", ["Id_Actas", "Row ID"])
    headers_by_tab = {"Documentación": doc_headers, "Actas XD e AX": minutes_headers}
    if MODE == "upload":
        # El proceso debe fallar antes de subir nada si Sheets no admite escrituras.
        for tab in headers_by_tab:
            verify_sheet_write_access(sheets, tab, headers_by_tab[tab])
            headers_by_tab[tab] = ensure_columns(sheets, tab, headers_by_tab[tab])
    indexes = {
        "documento": list_folder(drive, DOCUMENTACION_FOLDER_ID),
        "acta": list_folder(drive, ACTAS_FOLDER_ID),
    }
    counters = {"ok": 0, "planned": 0, "uploaded": 0, "errors": 0}
    fields = ["category", "tab", "row", "record_id", "source_name", "r2_key", "status", "size", "sha256", "detail"]
    with REPORT_PATH.open("w", newline="", encoding="utf-8-sig") as report:
        writer = csv.DictWriter(report, fieldnames=fields)
        writer.writeheader()
        for item in docs + minutes:
            base = {"category": item.category, "tab": item.tab, "row": item.row_number, "record_id": item.record_id, "source_name": item.source_name, "r2_key": item.r2_key, "size": "", "sha256": "", "detail": ""}
            matches = indexes[item.category].get(item.source_name, [])
            if not item.record_id:
                writer.writerow({**base, "status": "ERROR_WITHOUT_ID", "detail": "La fila no tiene ID estable"}); counters["errors"] += 1; continue
            if len(matches) != 1:
                detail = "No aparece en Drive" if not matches else f"{len(matches)} archivos con el mismo nombre"
                writer.writerow({**base, "status": "ERROR_SOURCE", "detail": detail}); counters["errors"] += 1; continue
            source = matches[0]
            source_size = int(source.get("size", 0) or 0)
            remote = head(client, bucket, item.r2_key)
            if remote:
                existing_metadata = metadata_from_existing(item, source, remote)
                remote_sha = str(remote.get("Metadata", {}).get("sha256", ""))
                if not existing_metadata:
                    writer.writerow({**base, "status": "ERROR_REMOTE_CONFLICT", "size": remote.get("ContentLength", 0), "sha256": remote_sha, "detail": "R2 contiene un objeto sin identidad verificable; no se sobrescribe"}); counters["errors"] += 1; continue
                if MODE == "upload":
                    headers_by_tab[item.tab] = update_sheet(
                        sheets, item, headers_by_tab[item.tab], existing_metadata
                    )
                    writer.writerow({**base, "status": "R2_EXISTS_SHEET_UPDATED", "size": source_size, "sha256": remote_sha}); counters["ok"] += 1; continue
                writer.writerow({**base, "status": "OK_R2_EXISTS", "size": source_size, "sha256": remote_sha}); counters["ok"] += 1; continue
            if MODE == "plan":
                writer.writerow({**base, "status": "PLAN_UPLOAD", "size": source_size}); counters["planned"] += 1; continue
            with tempfile.TemporaryDirectory(prefix="scpp-documentacion-r2-") as tmp:
                local = pathlib.Path(tmp) / item.source_name
                size, sha256 = download(drive, source["id"], local)
                if source_size and size != source_size:
                    writer.writerow({**base, "status": "ERROR_DOWNLOAD_SIZE", "size": size, "sha256": sha256, "detail": f"Drive indicó {source_size}"}); counters["errors"] += 1; continue
                mime = source.get("mimeType") or mimetypes.guess_type(item.source_name)[0] or "application/octet-stream"
                with local.open("rb") as body:
                    client.put_object(Bucket=bucket, Key=item.r2_key, Body=body, ContentLength=size, ContentType=mime, Metadata={"sha256": sha256, "source-drive-id": source["id"], "record-id": item.record_id, "asset-type": item.category})
                verified = head(client, bucket, item.r2_key)
                if not verified or int(verified.get("ContentLength", 0)) != size or verified.get("Metadata", {}).get("sha256") != sha256:
                    writer.writerow({**base, "status": "ERROR_R2_VERIFY", "size": size, "sha256": sha256}); counters["errors"] += 1; continue
                metadata = {"R2Key": item.r2_key, "R2ETag": str(verified.get("ETag", "")).strip('"'), "R2SHA256": sha256, "R2Size": size, "R2MimeType": mime, "R2Estado": "SINCRONIZADO", "R2Actualizada": datetime.now(timezone.utc).isoformat(), "R2Erro": ""}
                headers_by_tab[item.tab] = update_sheet(sheets, item, headers_by_tab[item.tab], metadata)
                writer.writerow({**base, "status": "UPLOADED_VERIFIED", "size": size, "sha256": sha256}); counters["uploaded"] += 1
    print(json.dumps({"mode": MODE, "documents": len(docs), "minutes": len(minutes), **counters}, ensure_ascii=False))
    print(f"Informe: {REPORT_PATH}")
    return 1 if counters["errors"] else 0


if __name__ == "__main__":
    sys.exit(run())
