#!/usr/bin/env python3
from __future__ import annotations

import csv
import json
import os
import pathlib
import re
import sys
import traceback
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass

import boto3
from botocore.exceptions import ClientError
from google.oauth2 import service_account
from googleapiclient.discovery import build

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
]
REPERTORIO_SHEET_ID = "1Hg_ZWsC6a7Sj-OCwRGyywzTJqqsIxUsAshk02yE9Enw"
AUDIO_SHEET_ID = "16BNPPni5BxowBsdGcvATj-zhYNLJYwjWoy2Zqtdu6i0"
PARTITURA_SHEET_ID = "18KCxQC7UnplDjPoAq2w4EgD8vGZ5G2JDAKvuXIewet0"
OBRAS_FILES_FOLDER_ID = "1QAt_iu_C2m7jfoTfC9dh5SePWNf0iULU"
REPORT_CSV = pathlib.Path(os.getenv("AUDIT_REPORT_CSV", "repertorio-audit.csv"))
REPORT_MD = pathlib.Path(os.getenv("AUDIT_REPORT_MD", "repertorio-audit.md"))


@dataclass
class Finding:
    severity: str
    code: str
    work_id: str = ""
    work_title: str = ""
    resource_type: str = ""
    record_id: str = ""
    detail: str = ""


def credentials():
    return service_account.Credentials.from_service_account_info(
        json.loads(os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"]), scopes=SCOPES
    )


def sheet_rows(sheets, spreadsheet_id: str, tab: str):
    values = sheets.spreadsheets().values().get(
        spreadsheetId=spreadsheet_id,
        range=f"'{tab}'!A:Z",
        valueRenderOption="FORMATTED_VALUE",
    ).execute().get("values", [])
    if not values:
        return []
    headers = [str(v).strip() for v in values[0]]
    result = []
    for row_number, raw in enumerate(values[1:], start=2):
        padded = list(raw) + [""] * (len(headers) - len(raw))
        row = dict(zip(headers, (str(v).strip() for v in padded)))
        row["__row__"] = str(row_number)
        if any(v for k, v in row.items() if k != "__row__"):
            result.append(row)
    return result


def canon(value) -> str:
    text = str(value or "").strip()
    try:
        return str(int(float(text.replace(",", "."))))
    except (TypeError, ValueError):
        return text


def truthy(value) -> bool:
    return str(value or "").strip().upper() in {"Y", "S", "SI", "SÍ", "TRUE", "1"}


def basename(value) -> str:
    return pathlib.PurePosixPath(str(value or "").replace("\\", "/")).name


def normalize_title(value) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn").lower()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return " ".join(text.split())


def r2_client():
    account_id = os.environ["R2_ACCOUNT_ID"]
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def r2_exists(client, bucket: str, key: str) -> bool:
    if not key:
        return False
    try:
        client.head_object(Bucket=bucket, Key=key.lstrip("/"))
        return True
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") in {"404", "NoSuchKey", "NotFound"}:
            return False
        raise


def list_drive_files(drive, folder_id: str):
    found = []
    pending = [folder_id]
    while pending:
        parent = pending.pop()
        token = None
        while True:
            response = drive.files().list(
                q=f"'{parent}' in parents and trashed = false",
                fields="nextPageToken,files(id,name,mimeType,parents)",
                pageSize=1000,
                pageToken=token,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
            ).execute()
            for item in response.get("files", []):
                if item.get("mimeType") == "application/vnd.google-apps.folder":
                    pending.append(item["id"])
                else:
                    found.append(item)
            token = response.get("nextPageToken")
            if not token:
                break
    return found


def derive_audio_key(row):
    return str(row.get("R2Key") or "").strip().lstrip("/")


def derive_score_key(row):
    return str(row.get("R2Key") or "").strip().lstrip("/") or (
        f"partituras/{basename(row.get('PDF'))}" if basename(row.get("PDF")) else ""
    )


def write_reports(findings: list[Finding], works: dict, active_by_work, completed: bool = True) -> None:
    REPORT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with REPORT_CSV.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.writer(handle)
        writer.writerow(["severity", "code", "work_id", "work_title", "resource_type", "record_id", "detail"])
        for item in findings:
            writer.writerow([item.severity, item.code, item.work_id, item.work_title, item.resource_type, item.record_id, item.detail])

    counts = Counter(item.severity for item in findings)
    if completed:
        resource_works = sum(
            1 for work_id in works
            if active_by_work[work_id]["audios"] or active_by_work[work_id]["partituras"]
        )
        works_count = str(len(works))
        resource_works_count = str(resource_works)
        audios_count = str(sum(v["audios"] for v in active_by_work.values()))
        scores_count = str(sum(v["partituras"] for v in active_by_work.values()))
    else:
        works_count = "non dispoñible"
        resource_works_count = "non dispoñible"
        audios_count = "non dispoñible"
        scores_count = "non dispoñible"

    lines = [
        "# Auditoría automática do repertorio",
        "",
        f"- Obras: **{works_count}**",
        f"- Obras con recursos activos: **{resource_works_count}**",
        f"- Audios activos: **{audios_count}**",
        f"- Partituras activas: **{scores_count}**",
        f"- Erros: **{counts['ERROR']}**",
        f"- Avisos: **{counts['WARNING']}**",
        f"- Información: **{counts['INFO']}**",
        "",
        "## Incidencias",
        "",
    ]
    if findings:
        lines.extend(["| Nivel | Código | Obra | Detalle |", "|---|---|---|---|"])
        for item in findings:
            work = f"{item.work_id} — {item.work_title}".strip(" —")
            detail = str(item.detail).replace("|", "\\|").replace("\n", " ")
            lines.append(f"| {item.severity} | {item.code} | {work} | {detail} |")
    else:
        lines.append("Non se detectaron incidencias.")
    REPORT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")


def run_audit():
    creds = credentials()
    sheets = build("sheets", "v4", credentials=creds, cache_discovery=False)
    drive = build("drive", "v3", credentials=creds, cache_discovery=False)
    r2 = r2_client()
    bucket = os.environ["R2_BUCKET"]

    works_rows = sheet_rows(sheets, REPERTORIO_SHEET_ID, "Repertorio")
    audio_rows = sheet_rows(sheets, AUDIO_SHEET_ID, "AudiosRepertorio")
    score_rows = sheet_rows(sheets, PARTITURA_SHEET_ID, "Partituras_App")

    works = {}
    findings: list[Finding] = []
    for row in works_rows:
        work_id = canon(row.get("Id"))
        title = row.get("NomeObra") or ""
        if not work_id:
            findings.append(Finding("ERROR", "WORK_WITHOUT_ID", detail=f"Fila {row['__row__']}: {title}"))
            continue
        if work_id in works:
            findings.append(Finding("ERROR", "DUPLICATE_WORK_ID", work_id, title, detail="ID repetido en Repertorio"))
        works[work_id] = row

    title_groups = defaultdict(list)
    for work_id, row in works.items():
        title_groups[normalize_title(row.get("NomeObra"))].append(work_id)
    for normalized, ids in title_groups.items():
        if normalized and len(ids) > 1:
            titles = [works[i].get("NomeObra", "") for i in ids]
            findings.append(Finding("WARNING", "DUPLICATE_TITLE", ",".join(ids), " / ".join(titles), detail="Títulos normalizados coincidentes"))

    active_by_work = defaultdict(lambda: {"audios": 0, "partituras": 0})
    registered_drive_names = set()
    active_keys = []

    for row in audio_rows:
        record_id = canon(row.get("Id_Audio"))
        work_id = canon(row.get("NomeObra"))
        active = truthy(row.get("Activo"))
        source = basename(row.get("AudioFile"))
        if source:
            registered_drive_names.add(normalize_title(source))
        if not active:
            continue
        title = works.get(work_id, {}).get("NomeObra", "")
        if not record_id:
            findings.append(Finding("ERROR", "ACTIVE_AUDIO_WITHOUT_ID", work_id, title, "audio", detail=f"Fila {row['__row__']}"))
        if not work_id or work_id not in works:
            findings.append(Finding("ERROR", "ORPHAN_AUDIO", work_id, title, "audio", record_id, "Obra inexistente"))
        if not source:
            findings.append(Finding("ERROR", "AUDIO_WITHOUT_SOURCE", work_id, title, "audio", record_id, "AudioFile vacío"))
        key = derive_audio_key(row)
        if not key:
            findings.append(Finding("ERROR", "AUDIO_WITHOUT_R2_KEY", work_id, title, "audio", record_id, "R2Key vacía"))
        elif not r2_exists(r2, bucket, key):
            findings.append(Finding("ERROR", "AUDIO_MISSING_IN_R2", work_id, title, "audio", record_id, key))
        else:
            active_keys.append(key)
        active_by_work[work_id]["audios"] += 1

    for row in score_rows:
        record_id = canon(row.get("Id_Partitura"))
        work_id = canon(row.get("Id_Repertorio"))
        active = truthy(row.get("Activa"))
        source = basename(row.get("PDF"))
        if source:
            registered_drive_names.add(normalize_title(source))
        if not active:
            continue
        title = works.get(work_id, {}).get("NomeObra", "")
        if not record_id:
            findings.append(Finding("ERROR", "ACTIVE_SCORE_WITHOUT_ID", work_id, title, "partitura", detail=f"Fila {row['__row__']}"))
        if not work_id or work_id not in works:
            findings.append(Finding("ERROR", "ORPHAN_SCORE", work_id, title, "partitura", record_id, "Obra inexistente"))
        if not source:
            findings.append(Finding("ERROR", "SCORE_WITHOUT_SOURCE", work_id, title, "partitura", record_id, "PDF vacío"))
        key = derive_score_key(row)
        if not key:
            findings.append(Finding("ERROR", "SCORE_WITHOUT_R2_KEY", work_id, title, "partitura", record_id, "R2Key vacía"))
        elif not r2_exists(r2, bucket, key):
            findings.append(Finding("ERROR", "SCORE_MISSING_IN_R2", work_id, title, "partitura", record_id, key))
        else:
            active_keys.append(key)
        active_by_work[work_id]["partituras"] += 1

    for key, count in Counter(active_keys).items():
        if count > 1:
            findings.append(Finding("WARNING", "R2_KEY_REUSED", detail=key))

    for work_id, row in works.items():
        counts = active_by_work[work_id]
        title = row.get("NomeObra", "")
        if not counts["audios"] and not counts["partituras"]:
            findings.append(Finding("WARNING", "WORK_WITHOUT_RESOURCES", work_id, title, detail="Sen audios nin partituras activas"))
        elif not counts["audios"]:
            findings.append(Finding("INFO", "WORK_WITHOUT_AUDIOS", work_id, title, detail="Ten partitura pero non audios"))
        elif not counts["partituras"]:
            findings.append(Finding("WARNING", "WORK_WITHOUT_SCORE", work_id, title, detail="Ten audios pero non partitura"))

    try:
        for item in list_drive_files(drive, OBRAS_FILES_FOLDER_ID):
            name = item.get("name", "")
            suffix = pathlib.PurePosixPath(name).suffix.lower()
            if suffix not in {".mp3", ".mp4", ".m4a", ".aac", ".mpeg", ".webm", ".wav", ".pdf"}:
                continue
            if normalize_title(name) not in registered_drive_names:
                findings.append(Finding("INFO", "DRIVE_FILE_NOT_REGISTERED", detail=name))
    except Exception as exc:
        findings.append(Finding("WARNING", "DRIVE_SCAN_FAILED", detail=str(exc)))

    write_reports(findings, works, active_by_work)
    counts = Counter(item.severity for item in findings)
    print(f"Auditoría: obras={len(works)}, erros={counts['ERROR']}, avisos={counts['WARNING']}, info={counts['INFO']}")
    print(f"Informes: {REPORT_CSV} e {REPORT_MD}")
    return 1 if counts["ERROR"] else 0


def main():
    try:
        return run_audit()
    except Exception as exc:
        detail = f"{type(exc).__name__}: {exc}"
        print("A auditoría fallou antes de completarse:", detail, file=sys.stderr)
        traceback.print_exc()
        write_reports(
            [Finding("ERROR", "AUDIT_EXECUTION_FAILED", detail=detail)],
            {},
            defaultdict(lambda: {"audios": 0, "partituras": 0}),
            completed=False,
        )
        return 2


if __name__ == "__main__":
    sys.exit(main())
