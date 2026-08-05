#!/usr/bin/env python3
"""Migra medios de conciertos desde Drive a R2 sin borrar ni sobrescribir conflictos."""

from __future__ import annotations

import csv
import hashlib
import json
import mimetypes
import os
import pathlib
import re
import sys
import tempfile
import unicodedata
import urllib.request
from collections import defaultdict
from dataclasses import dataclass

import boto3
from botocore.exceptions import ClientError
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload


MODE = os.getenv("MIGRATION_MODE", "plan").strip().lower()
REPORT_PATH = pathlib.Path(os.getenv("REPORT_PATH", "concertos-r2-migration.csv"))
CONCERTOS_FILES_FOLDER_ID = os.getenv(
    "CONCERTOS_FILES_FOLDER_ID", "1H12S32zJzncJoXdUvbZx82CLFXvlhtd6"
)
CONCERTOS_IMAGES_FOLDER_ID = os.getenv(
    "CONCERTOS_IMAGES_FOLDER_ID", "1yvEWIatZIa3UnE71VQUb4LCvBZ6HLs6t"
)
CONCERTOS_CSV_URL = os.getenv(
    "CONCERTOS_CSV_URL",
    "https://docs.google.com/spreadsheets/d/e/"
    "2PACX-1vSX8BEJ-hrubqEtaZ1zZaLSy7LoxaDQOuQuqR2ior7TZErtBGL5bJG0B_"
    "AK5Dp8eFeTDb3Pmpqh7Hnu/pub?gid=1098509641&single=true&output=csv",
)


@dataclass(frozen=True)
class SourceFolder:
    code: str
    drive_id: str
    logical_root: str


@dataclass
class Asset:
    source_folder: str
    relative_path: str
    drive_id: str
    source_size: int
    mime_type: str
    roles: list[str]
    concert_ids: list[str]
    visibility: str
    r2_key: str


FOLDERS = [
    SourceFolder("files", CONCERTOS_FILES_FOLDER_ID, "Concertos_Files_"),
    SourceFolder("images", CONCERTOS_IMAGES_FOLDER_ID, "Concertos_Images"),
]


def required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Falta la variable {name}")
    return value


def credentials():
    info = json.loads(required("GOOGLE_SERVICE_ACCOUNT_JSON"))
    print(f"Cuenta de servicio de Google: {info.get('client_email', '')}")
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


def clean_path(value: str) -> str:
    return "/".join(
        part for part in str(value or "").replace("\\", "/").strip().split("/")
        if part and part not in {".", ".."}
    )


def slug(value: str) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn").lower()
    text = re.sub(r"[^a-z0-9._-]+", "-", text).strip("-.")
    return text or "arquivo"


def load_references():
    request = urllib.request.Request(CONCERTOS_CSV_URL, headers={"User-Agent": "SCPP-R2-Migration/1.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        text = response.read().decode("utf-8-sig")
    references = defaultdict(lambda: {"roles": set(), "concert_ids": set()})
    for row in csv.DictReader(text.splitlines()):
        concert_id = str(row.get("Id", "")).strip()
        for column in ("Cartel", "Triptico", "Prensa"):
            path = clean_path(row.get(column, ""))
            if not path:
                continue
            references[path]["roles"].add(column)
            if concert_id:
                references[path]["concert_ids"].add(concert_id)
            basename_key = f"@basename/{path.rsplit('/', 1)[-1].casefold()}"
            references[basename_key]["roles"].add(column)
            if concert_id:
                references[basename_key]["concert_ids"].add(concert_id)
    return references


def list_folder(drive, source: SourceFolder):
    files = []
    pending = [(source.drive_id, "")]
    while pending:
        parent_id, relative_parent = pending.pop()
        token = None
        while True:
            response = drive.files().list(
                q=f"'{parent_id}' in parents and trashed = false",
                fields="nextPageToken,files(id,name,mimeType,size)",
                pageSize=1000,
                pageToken=token,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
            ).execute()
            for item in response.get("files", []):
                relative = clean_path(f"{relative_parent}/{item.get('name', '')}")
                if item.get("mimeType") == "application/vnd.google-apps.folder":
                    pending.append((item["id"], relative))
                else:
                    files.append((relative, item))
            token = response.get("nextPageToken")
            if not token:
                break
    return files


def target_for(source: SourceFolder, relative_path: str, reference: dict):
    roles = sorted(reference.get("roles", set()))
    if "Cartel" in roles:
        visibility, prefix = "public", "concertos/imaxes"
    elif roles:
        visibility, prefix = "public", "concertos/documentos"
    else:
        visibility, prefix = "private-pending-review", "concertos/pendentes"
    return visibility, f"{prefix}/{source.code}/{slug(relative_path)}"


def infer_roles_from_name(relative_path: str):
    name = relative_path.rsplit("/", 1)[-1].casefold()
    role_names = {"cartel": "Cartel", "triptico": "Triptico", "prensa": "Prensa"}
    return {
        canonical
        for token, canonical in role_names.items()
        if re.search(rf"(?:^|[._ -]){token}(?:[._ -]|$)", name)
    }


def inventory(drive, references):
    assets = []
    for source in FOLDERS:
        for relative, item in list_folder(drive, source):
            logical_path = clean_path(f"{source.logical_root}/{relative}")
            basename_key = f"@basename/{relative.rsplit('/', 1)[-1].casefold()}"
            reference = references.get(logical_path) or references.get(basename_key, {})
            if not reference:
                inferred_roles = infer_roles_from_name(relative)
                if inferred_roles:
                    reference = {"roles": inferred_roles, "concert_ids": set()}
            visibility, key = target_for(source, relative, reference)
            assets.append(Asset(
                source_folder=source.code,
                relative_path=relative,
                drive_id=item["id"],
                source_size=int(item.get("size", 0) or 0),
                mime_type=item.get("mimeType") or mimetypes.guess_type(relative)[0] or "application/octet-stream",
                roles=sorted(reference.get("roles", set())),
                concert_ids=sorted(reference.get("concert_ids", set())),
                visibility=visibility,
                r2_key=key,
            ))
    assets.sort(key=lambda item: (item.source_folder, item.relative_path.lower()))
    return assets


def head(client, bucket: str, key: str):
    try:
        return client.head_object(Bucket=bucket, Key=key)
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") in {"404", "NoSuchKey", "NotFound"}:
            return None
        raise


def existing_is_owned(remote: dict, asset: Asset):
    metadata = remote.get("Metadata", {})
    return (
        int(remote.get("ContentLength", 0) or 0) == asset.source_size
        and metadata.get("source-drive-id") == asset.drive_id
        and metadata.get("sha256")
    )


def download(drive, asset: Asset, destination: pathlib.Path):
    request = drive.files().get_media(fileId=asset.drive_id, supportsAllDrives=True)
    with destination.open("wb") as handle:
        downloader = MediaIoBaseDownload(handle, request, chunksize=8 * 1024 * 1024)
        done = False
        while not done:
            _, done = downloader.next_chunk()
    digest = hashlib.sha256()
    size = 0
    with destination.open("rb") as handle:
        while chunk := handle.read(8 * 1024 * 1024):
            size += len(chunk)
            digest.update(chunk)
    return size, digest.hexdigest()


def report_row(asset: Asset):
    return {
        "source_folder": asset.source_folder,
        "relative_path": asset.relative_path,
        "roles": ",".join(asset.roles),
        "concert_ids": ",".join(asset.concert_ids),
        "visibility": asset.visibility,
        "r2_key": asset.r2_key,
        "status": "",
        "size": asset.source_size,
        "sha256": "",
        "detail": "",
    }


def run():
    if MODE not in {"plan", "upload"}:
        raise RuntimeError("MIGRATION_MODE debe ser plan o upload")
    drive = build("drive", "v3", credentials=credentials(), cache_discovery=False)
    client, bucket = r2_client(), required("R2_BUCKET")
    references = load_references()
    assets = inventory(drive, references)
    counters = {"ok": 0, "planned": 0, "uploaded": 0, "errors": 0, "pending_review": 0}
    fields = [
        "source_folder", "relative_path", "roles", "concert_ids", "visibility",
        "r2_key", "status", "size", "sha256", "detail",
    ]
    with REPORT_PATH.open("w", newline="", encoding="utf-8-sig") as report:
        writer = csv.DictWriter(report, fieldnames=fields)
        writer.writeheader()
        for asset in assets:
            row = report_row(asset)
            if asset.visibility == "private-pending-review":
                counters["pending_review"] += 1
            remote = head(client, bucket, asset.r2_key)
            if remote:
                remote_sha = str(remote.get("Metadata", {}).get("sha256", ""))
                if existing_is_owned(remote, asset):
                    writer.writerow({**row, "status": "OK_R2_EXISTS", "sha256": remote_sha})
                    counters["ok"] += 1
                else:
                    writer.writerow({**row, "status": "ERROR_REMOTE_CONFLICT", "sha256": remote_sha, "detail": "R2 contiene un objeto sin identidad verificable; no se sobrescribe"})
                    counters["errors"] += 1
                continue
            if MODE == "plan":
                writer.writerow({**row, "status": "PLAN_UPLOAD"})
                counters["planned"] += 1
                continue
            with tempfile.TemporaryDirectory(prefix="scpp-concertos-r2-") as tmp:
                local = pathlib.Path(tmp) / "asset.bin"
                size, sha256 = download(drive, asset, local)
                if asset.source_size and size != asset.source_size:
                    writer.writerow({**row, "status": "ERROR_DOWNLOAD_SIZE", "size": size, "sha256": sha256, "detail": f"Drive indicó {asset.source_size}"})
                    counters["errors"] += 1
                    continue
                with local.open("rb") as body:
                    client.put_object(
                        Bucket=bucket,
                        Key=asset.r2_key,
                        Body=body,
                        ContentLength=size,
                        ContentType=asset.mime_type,
                        Metadata={
                            "sha256": sha256,
                            "source-drive-id": asset.drive_id,
                            "source-name": asset.relative_path,
                            "asset-type": ",".join(asset.roles) or "pending-review",
                            "visibility": asset.visibility,
                        },
                    )
                verified = head(client, bucket, asset.r2_key)
                if not verified or int(verified.get("ContentLength", 0)) != size or verified.get("Metadata", {}).get("sha256") != sha256:
                    writer.writerow({**row, "status": "ERROR_R2_VERIFY", "size": size, "sha256": sha256})
                    counters["errors"] += 1
                    continue
                writer.writerow({**row, "status": "UPLOADED_VERIFIED", "size": size, "sha256": sha256})
                counters["uploaded"] += 1
    print(json.dumps({"mode": MODE, "assets": len(assets), **counters}, ensure_ascii=False))
    print(f"Informe: {REPORT_PATH}")
    return 1 if counters["errors"] else 0


if __name__ == "__main__":
    sys.exit(run())

