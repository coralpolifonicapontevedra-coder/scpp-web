#!/usr/bin/env python3
"""Audita medios de conciertos por contenido y destino real en R2, sin modificar nada."""

from __future__ import annotations

import csv
import json
import os
import pathlib
import sys
from collections import Counter, defaultdict

import boto3
from google.oauth2 import service_account
from googleapiclient.discovery import build

REPORT_CSV = pathlib.Path(os.getenv("CONCERT_MEDIA_AUDIT_CSV", "concert-media-audit.csv"))
REPORT_JSON = pathlib.Path(os.getenv("CONCERT_MEDIA_AUDIT_JSON", "concert-media-audit.json"))
REPORT_MD = pathlib.Path(os.getenv("CONCERT_MEDIA_AUDIT_MD", "concert-media-audit.md"))

CONCERTOS_FILES_FOLDER_ID = os.getenv(
    "CONCERTOS_FILES_FOLDER_ID", "1H12S32zJzncJoXdUvbZx82CLFXvlhtd6"
)
CONCERTOS_IMAGES_FOLDER_ID = os.getenv(
    "CONCERTOS_IMAGES_FOLDER_ID", "1yvEWIatZIa3UnE71VQUb4LCvBZ6HLs6t"
)
PREFIXES = (
    "concertos/documentos/objetos/",
    "concertos/imaxes/objetos/",
    "concertos/orixinais/objetos/",
    "concertos/pendentes/objetos/",
)


def required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Falta la variable {name}")
    return value


def credentials():
    info = json.loads(required("GOOGLE_SERVICE_ACCOUNT_JSON"))
    return service_account.Credentials.from_service_account_info(
        info, scopes=["https://www.googleapis.com/auth/drive.readonly"]
    )


def r2_client():
    return boto3.client(
        "s3",
        endpoint_url=f"https://{required('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com",
        aws_access_key_id=required("R2_ACCESS_KEY_ID"),
        aws_secret_access_key=required("R2_SECRET_ACCESS_KEY"),
        region_name="auto",
    )


def list_drive_files(drive, folder_id: str):
    files, pending = [], [folder_id]
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
            for item in response.get("files", []):
                if item.get("mimeType") == "application/vnd.google-apps.folder":
                    pending.append(item["id"])
                else:
                    files.append(item)
            token = response.get("nextPageToken")
            if not token:
                break
    return files


def list_r2_keys(client, bucket: str):
    keys = set()
    token = None
    while True:
        args = {"Bucket": bucket, "Prefix": "concertos/", "MaxKeys": 1000}
        if token:
            args["ContinuationToken"] = token
        page = client.list_objects_v2(**args)
        for item in page.get("Contents", []):
            keys.add(str(item.get("Key", "")))
        if not page.get("IsTruncated"):
            return keys
        token = page.get("NextContinuationToken")


def candidates(item: dict):
    md5 = str(item.get("md5Checksum", "") or "").strip().lower()
    suffix = pathlib.PurePosixPath(str(item.get("name", ""))).suffix.lower()
    if not md5 or not suffix:
        return []
    return [f"{prefix}{md5}{suffix}" for prefix in PREFIXES]


def classify_target(key: str):
    if key.startswith("concertos/documentos/"):
        return "documentos"
    if key.startswith("concertos/imaxes/"):
        return "imaxes"
    if key.startswith("concertos/orixinais/"):
        return "orixinais"
    if key.startswith("concertos/pendentes/"):
        return "pendentes"
    return "outro"


def audit_group(label: str, files: list[dict], r2_keys: set[str]):
    rows = []
    by_md5 = defaultdict(list)
    target_counts = Counter()
    missing = []

    for item in sorted(files, key=lambda x: str(x.get("name", "")).casefold()):
        md5 = str(item.get("md5Checksum", "") or "").strip().lower()
        if md5:
            by_md5[md5].append(str(item.get("name", "")))
        matches = [key for key in candidates(item) if key in r2_keys]
        target = classify_target(matches[0]) if matches else "faltante"
        if matches:
            target_counts[target] += 1
        else:
            missing.append(str(item.get("name", "")))
        rows.append({
            "scope": label,
            "name": str(item.get("name", "")),
            "drive_id": str(item.get("id", "")),
            "size": int(item.get("size", 0) or 0),
            "md5": md5,
            "r2_status": "OK" if matches else "MISSING",
            "r2_target": target,
            "r2_key": matches[0] if matches else "",
        })

    duplicate_groups = {md5: names for md5, names in by_md5.items() if len(names) > 1}
    return {
        "files": len(files),
        "unique_content": len(by_md5),
        "duplicate_files": sum(len(names) - 1 for names in duplicate_groups.values()),
        "missing_r2": len(missing),
        "missing_names": missing,
        "destinations": dict(target_counts),
        "duplicates": duplicate_groups,
        "rows": rows,
    }


def write_reports(payload: dict):
    REPORT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    with REPORT_CSV.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=[
            "scope", "name", "drive_id", "size", "md5", "r2_status", "r2_target", "r2_key"
        ])
        writer.writeheader()
        for section in ("programas", "imaxes"):
            writer.writerows(payload[section]["rows"])

    lines = [
        "# Auditoría de medios de conciertos",
        "",
        "Auditoría de solo lectura por identidad de contenido (MD5) y destino real en R2.",
        "",
        "| Ámbito | Archivos Drive | Contenidos únicos | Duplicados Drive | Falta en R2 |",
        "|---|---:|---:|---:|---:|",
    ]
    for key, label in (("programas", "Programas / documentos"), ("imaxes", "Carteles e imágenes")):
        item = payload[key]
        lines.append(
            f"| {label} | {item['files']} | {item['unique_content']} | {item['duplicate_files']} | {item['missing_r2']} |"
        )
        destinos = ", ".join(f"{name}: {count}" for name, count in sorted(item["destinations"].items())) or "ninguno"
        lines.append(f"\nDestinos R2 de **{label}**: {destinos}.\n")
        if item["duplicates"]:
            lines.append("Duplicados por contenido:")
            for md5, names in sorted(item["duplicates"].items()):
                lines.append(f"- `{md5}`: " + ", ".join(names))
            lines.append("")
        if item["missing_names"]:
            lines.append("Archivos sin objeto R2 correspondiente:")
            for name in item["missing_names"]:
                lines.append(f"- {name}")
            lines.append("")
    lines.append("No se elimina, mueve ni sobrescribe ningún archivo.")
    REPORT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    drive = build("drive", "v3", credentials=credentials(), cache_discovery=False)
    client = r2_client()
    bucket = required("R2_BUCKET")
    r2_keys = list_r2_keys(client, bucket)

    payload = {
        "version": 1,
        "read_only": True,
        "programas": audit_group("programas", list_drive_files(drive, CONCERTOS_FILES_FOLDER_ID), r2_keys),
        "imaxes": audit_group("imaxes", list_drive_files(drive, CONCERTOS_IMAGES_FOLDER_ID), r2_keys),
    }
    write_reports(payload)
    missing = payload["programas"]["missing_r2"] + payload["imaxes"]["missing_r2"]
    print(json.dumps({
        "programas": {k: payload["programas"][k] for k in ("files", "unique_content", "duplicate_files", "missing_r2", "destinations")},
        "imaxes": {k: payload["imaxes"][k] for k in ("files", "unique_content", "duplicate_files", "missing_r2", "destinations")},
    }, ensure_ascii=False))
    print(f"Informes: {REPORT_MD}, {REPORT_CSV}, {REPORT_JSON}")
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
