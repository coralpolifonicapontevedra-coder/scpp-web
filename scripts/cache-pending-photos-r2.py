#!/usr/bin/env python3
import io
import json
import mimetypes
import os
from datetime import datetime, timezone

import boto3
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

SPREADSHEET_ID = "1NhWEnrlOk285ECxUQMB3Pedd28TNkiMmN-K25vzd_2w"
RANGE = "Fotos!A1:AC5000"
FOLDER_ID = "1FySxDvTHVNC20-a3I0wDU1v0s82VRiix"
BUCKET = "scpp-privado"
VALID_MIMES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


def cell(row, index, name):
    pos = index[name]
    return str(row[pos] if pos < len(row) else "").strip()


def main():
    required = [
        "GOOGLE_SERVICE_ACCOUNT_JSON",
        "R2_ACCOUNT_ID",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
    ]
    missing = [name for name in required if not os.environ.get(name)]
    if missing:
        raise SystemExit("Faltan secretos: " + ", ".join(missing))

    info = json.loads(os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"])
    credentials = service_account.Credentials.from_service_account_info(
        info,
        scopes=[
            "https://www.googleapis.com/auth/spreadsheets.readonly",
            "https://www.googleapis.com/auth/drive.readonly",
        ],
    )
    sheets = build("sheets", "v4", credentials=credentials, cache_discovery=False)
    drive = build("drive", "v3", credentials=credentials, cache_discovery=False)

    values = sheets.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID, range=RANGE
    ).execute().get("values", [])
    if not values:
        raise SystemExit("La hoja Fotos está vacía")

    headers = [str(v).strip() for v in values[0]]
    index = {name: i for i, name in enumerate(headers)}
    needed = ["Id_Foto", "Foto", "EstadoRevision", "Publicar_Publica", "Publicar_Privada"]
    absent = [name for name in needed if name not in index]
    if absent:
        raise SystemExit("Faltan columnas: " + ", ".join(absent))

    pending = []
    for row in values[1:]:
        if cell(row, index, "EstadoRevision").lower() != "pendente":
            continue
        photo_id = cell(row, index, "Id_Foto")
        route = cell(row, index, "Foto")
        filename = route.replace("\\", "/").split("/")[-1]
        if photo_id and filename:
            pending.append({
                "id": photo_id,
                "filename": filename,
                "public": cell(row, index, "Publicar_Publica").lower() in {"true", "1", "yes", "si", "sí"},
                "private": cell(row, index, "Publicar_Privada").lower() in {"true", "1", "yes", "si", "sí"},
            })

    response = drive.files().list(
        q=f"'{FOLDER_ID}' in parents and trashed = false",
        fields="nextPageToken,files(id,name,mimeType,size)",
        pageSize=1000,
    ).execute()
    files = {item["name"]: item for item in response.get("files", [])}
    while response.get("nextPageToken"):
        response = drive.files().list(
            q=f"'{FOLDER_ID}' in parents and trashed = false",
            fields="nextPageToken,files(id,name,mimeType,size)",
            pageSize=1000,
            pageToken=response["nextPageToken"],
        ).execute()
        files.update({item["name"]: item for item in response.get("files", [])})

    endpoint = f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com"
    r2 = boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )

    uploaded = 0
    missing_files = []
    for photo in pending:
        item = files.get(photo["filename"])
        if not item:
            missing_files.append(photo["filename"])
            continue
        mime = str(item.get("mimeType") or mimetypes.guess_type(item["name"])[0] or "").lower()
        if mime not in VALID_MIMES:
            print(f"Formato omitido: {item['name']} ({mime})")
            continue

        ext = VALID_MIMES[mime]
        key = f"fotos/traballo/{photo['id']}.{ext}"
        marker_key = f"fotos/traballo/{photo['id']}.json"

        try:
            r2.head_object(Bucket=BUCKET, Key=marker_key)
            print(f"Xa preparada: {photo['id']}")
            continue
        except Exception:
            pass

        buffer = io.BytesIO()
        request = drive.files().get_media(fileId=item["id"])
        downloader = MediaIoBaseDownload(buffer, request)
        done = False
        while not done:
            _, done = downloader.next_chunk()
        data = buffer.getvalue()

        r2.put_object(
            Bucket=BUCKET,
            Key=key,
            Body=data,
            ContentType=mime,
            CacheControl="private, max-age=31536000, immutable",
            Metadata={"idfoto": photo["id"], "tipo": "orixinal-traballo"},
        )
        marker = {
            "idFoto": photo["id"],
            "ruta": key,
            "mimeType": mime,
            "publicarPublica": photo["public"],
            "publicarPrivada": photo["private"],
            "creadoEn": datetime.now(timezone.utc).isoformat(),
            "orixe": "github-actions",
        }
        r2.put_object(
            Bucket=BUCKET,
            Key=marker_key,
            Body=json.dumps(marker, ensure_ascii=False).encode("utf-8"),
            ContentType="application/json; charset=utf-8",
            CacheControl="private, max-age=31536000",
        )
        uploaded += 1
        print(f"Preparada: {photo['id']} | {photo['filename']}")

    print(f"Pendentes detectadas: {len(pending)}")
    print(f"Novas copias preparadas: {uploaded}")
    if missing_files:
        print("Non atopadas en Drive:")
        for name in missing_files:
            print(f"- {name}")
        raise SystemExit(2)


if __name__ == "__main__":
    main()
