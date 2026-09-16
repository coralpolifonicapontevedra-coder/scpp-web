#!/usr/bin/env python3
"""Busca de só lectura en Drive/R2 para materiais de Abrem'a portiña e Aquel que saleu agora."""

from __future__ import annotations

import json
import os
import re
import unicodedata

import boto3
from google.oauth2 import service_account
from googleapiclient.discovery import build

SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]
AUDIO_FOLDER_ID = "1QAt_iu_C2m7jfoTfC9dh5SePWNf0iULU"
PARTITURA_FOLDER_ID = "1ZbqnD4Gda7gkJrQOLE-eNhiLboz7iqJm"

TERMS = [
    "abrem a portina",
    "abrema portina",
    "abrem portina",
    "portina",
    "aquel que saleu agora",
    "aquel saleu agora",
    "saleu agora",
    "bertomeu",
]


def norm(value: str) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = text.lower().replace("’", "'").replace("´", "'")
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def matches(value: str) -> bool:
    hay = norm(value)
    return any(norm(term) in hay for term in TERMS)


def list_drive_files(drive, folder_id: str):
    files, pending = [], [folder_id]
    while pending:
        parent = pending.pop()
        token = None
        while True:
            response = drive.files().list(
                q=f"'{parent}' in parents and trashed = false",
                fields="nextPageToken,files(id,name,mimeType,size,modifiedTime,parents)",
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


def list_r2(client, bucket: str):
    objects = []
    token = None
    while True:
        args = {"Bucket": bucket, "MaxKeys": 1000}
        if token:
            args["ContinuationToken"] = token
        page = client.list_objects_v2(**args)
        objects.extend(page.get("Contents", []))
        if not page.get("IsTruncated"):
            return objects
        token = page.get("NextContinuationToken")


def main():
    creds = service_account.Credentials.from_service_account_info(
        json.loads(os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"]), scopes=SCOPES
    )
    drive = build("drive", "v3", credentials=creds, cache_discovery=False)

    account_id = os.environ["R2_ACCOUNT_ID"]
    r2 = boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )
    bucket = os.environ["R2_BUCKET"]

    drive_audio = list_drive_files(drive, AUDIO_FOLDER_ID)
    drive_scores = list_drive_files(drive, PARTITURA_FOLDER_ID)
    r2_objects = list_r2(r2, bucket)

    drive_hits = [
        {"scope": "audios" if item in drive_audio else "partituras", **item}
        for item in (drive_audio + drive_scores)
        if matches(item.get("name", ""))
    ]
    r2_hits = [
        {"key": item.get("Key", ""), "size": int(item.get("Size", 0) or 0)}
        for item in r2_objects
        if matches(item.get("Key", ""))
    ]

    id_hits = [
        {"key": item.get("Key", ""), "size": int(item.get("Size", 0) or 0)}
        for item in r2_objects
        if str(item.get("Key", "")).startswith(("repertorio/audios/90/", "repertorio/audios/91/"))
    ]

    report = {
        "terms": TERMS,
        "drive": {
            "audio_files_total": len(drive_audio),
            "score_files_total": len(drive_scores),
            "hits": drive_hits,
        },
        "r2": {
            "objects_total": len(r2_objects),
            "name_hits": r2_hits,
            "id_90_91_hits": id_hits,
        },
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
