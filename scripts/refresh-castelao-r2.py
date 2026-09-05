import hashlib
import io
import json
import os

import boto3
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

FILES = [
    {
        "name": "Pano de San David",
        "drive_id": "1BcKDwAkVeK56uidUBER_zem53eDWwvTX",
        "r2_key": "fotos/orixinais/c5875c20-7c55-536e-8419-32ad2404c70b.jpg",
        "content_type": "image/png",
        "expected_size": 775602,
        "expected_sha256": "c421bc9a66fe96cab03046a499638698f75a54696470ab17edad2574c7375a2f",
    },
    {
        "name": "Rosetón oxival",
        "drive_id": "1Jebe2Ob8fuY7pjCmEd8_RwEdy1rTJi6f",
        "r2_key": "fotos/orixinais/91630e1a-725d-42c9-9aa5-259e6655ef08.jpg",
        "content_type": "image/jpeg",
        "expected_size": 2132968,
        "expected_sha256": "dcc2cbd905142811e6f74affcdd972b6600dc2e2a1d274a86036996aeadce8f7",
    },
    {
        "name": "Logo de San David",
        "drive_id": "1bgjmpZvhG-mlN0-V5apXBrIYsqqs0d1d",
        "r2_key": "fotos/orixinais/373c7089-3234-430a-b035-7eb3b86beb80.jpg",
        "content_type": "image/jpeg",
        "expected_size": 116952,
        "expected_sha256": "83d00388dd4c06914a59126cc46459d10e4ae1e21a8296bf54d71356dc251419",
    },
    {
        "name": "Logo de San David · variante 2",
        "drive_id": "1Jd9G52WPZ93XvFcYZhyaYofC0ARGOrzV",
        "r2_key": "fotos/orixinais/37ea56e6-5894-4693-83d6-c3465b4f7be0.jpg",
        "content_type": "image/jpeg",
        "expected_size": 94089,
        "expected_sha256": "e8b6998f5783c1d77ede76138bbff8396abe5c10a035a5b6f2f43d80832931a2",
    },
    {
        "name": "Logo de San David · versión histórica asinada",
        "drive_id": "1jDD3iandTgYTx9uksXmavAZxi7iu-HNW",
        "r2_key": "fotos/orixinais/3ee29336-fc4d-4a1f-97a9-e1575291494c.png",
        "content_type": "image/png",
        "expected_size": 732087,
        "expected_sha256": "fdfb5b7b6799bee8b50e31554386cdd3207559879da994f74af979658e2c56b4",
    },
]


def drive_service():
    raw = os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"]
    info = json.loads(raw)
    creds = service_account.Credentials.from_service_account_info(
        info,
        scopes=["https://www.googleapis.com/auth/drive.readonly"],
    )
    return build("drive", "v3", credentials=creds, cache_discovery=False)


def r2_client():
    account_id = os.environ["R2_ACCOUNT_ID"]
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def download_drive_file(service, file_id: str) -> bytes:
    request = service.files().get_media(fileId=file_id)
    stream = io.BytesIO()
    downloader = MediaIoBaseDownload(stream, request, chunksize=1024 * 1024)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    return stream.getvalue()


def validate_source(item, data: bytes) -> str:
    digest = hashlib.sha256(data).hexdigest()
    if len(data) != item["expected_size"]:
        raise RuntimeError(
            f"Tamaño inesperado para {item['name']}: {len(data)} != {item['expected_size']}"
        )
    if digest != item["expected_sha256"]:
        raise RuntimeError(
            f"SHA-256 inesperado para {item['name']}: {digest} != {item['expected_sha256']}"
        )
    return digest


def main():
    bucket = os.environ.get("R2_BUCKET", "scpp-publico")
    drive = drive_service()
    r2 = r2_client()

    for item in FILES:
        data = download_drive_file(drive, item["drive_id"])
        if not data:
            raise RuntimeError(f"Descarga baleira: {item['name']}")

        digest = validate_source(item, data)

        r2.put_object(
            Bucket=bucket,
            Key=item["r2_key"],
            Body=data,
            ContentType=item["content_type"],
            CacheControl="public, max-age=3600",
            Metadata={
                "drive-id": item["drive_id"],
                "source": "arquivo-scpp-panos-castelao",
                "sha256": digest,
            },
        )

        head = r2.head_object(Bucket=bucket, Key=item["r2_key"])
        if head.get("ContentLength") != item["expected_size"]:
            raise RuntimeError(
                f"R2 gardou tamaño incorrecto para {item['name']}: {head.get('ContentLength')}"
            )
        print(
            f"OK | {item['name']} | {item['r2_key']} | "
            f"bytes={head.get('ContentLength')} | sha256={digest} | etag={head.get('ETag')}"
        )


if __name__ == "__main__":
    main()
