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
        "drive_id": "1eFX4RgrgWbbmk7nsqiVIYn0xqsediyZ6",
        "r2_key": "fotos/orixinais/c5875c20-7c55-536e-8419-32ad2404c70b.jpg",
        "content_type": "image/png",
    },
    {
        "name": "Rosetón oxival",
        "drive_id": "1Wq9l6av5HFVaXyNIZFEMs3g9jEs7NrNN",
        "r2_key": "fotos/orixinais/91630e1a-725d-42c9-9aa5-259e6655ef08.jpg",
        "content_type": "image/jpeg",
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


def main():
    bucket = os.environ.get("R2_BUCKET", "scpp-publico")
    drive = drive_service()
    r2 = r2_client()

    for item in FILES:
        data = download_drive_file(drive, item["drive_id"])
        if not data:
            raise RuntimeError(f"Descarga baleira: {item['name']}")

        r2.put_object(
            Bucket=bucket,
            Key=item["r2_key"],
            Body=data,
            ContentType=item["content_type"],
            CacheControl="public, max-age=3600",
            Metadata={
                "drive-id": item["drive_id"],
                "source": "arquivo-scpp-panos-castelao",
            },
        )

        head = r2.head_object(Bucket=bucket, Key=item["r2_key"])
        print(
            f"OK | {item['name']} | {item['r2_key']} | "
            f"bytes={head.get('ContentLength')} | etag={head.get('ETag')}"
        )


if __name__ == "__main__":
    main()
