#!/usr/bin/env python3
"""Auditoría global, de solo lectura, de los archivos usados por la web SCPP."""

from __future__ import annotations

import csv
import hashlib
import json
import os
import pathlib
import re
import sys
import traceback
from collections import Counter, defaultdict
from dataclasses import dataclass

import boto3
from botocore.exceptions import ClientError
from google.oauth2 import service_account
from googleapiclient.discovery import build


ROOT = pathlib.Path(__file__).resolve().parents[1]
REPORT_CSV = pathlib.Path(os.getenv("FILES_AUDIT_CSV", "files-audit.csv"))
REPORT_JSON = pathlib.Path(os.getenv("FILES_AUDIT_JSON", "files-audit.json"))
REPORT_MD = pathlib.Path(os.getenv("FILES_AUDIT_MD", "files-audit.md"))
SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]
FILE_EXTENSIONS = {
    ".pdf", ".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg",
    ".mp3", ".m4a", ".wav", ".aac", ".ogg", ".webm", ".mp4", ".mov",
}


@dataclass(frozen=True)
class DriveScope:
    code: str
    label: str
    folder_id: str
    target: str
    decision: str
    privacy: str


@dataclass
class Finding:
    severity: str
    code: str
    scope: str
    detail: str
    count: int = 0
    size: int = 0


DRIVE_SCOPES = [
    DriveScope("documentacion", "Documentación", os.getenv("DOCUMENTACION_FOLDER_ID", "1T8izGJMWiWH0cSNHyKIDvSQZXtB2LgyQ"), "documentacion/documentos/", "MIGRATE_PRIVATE", "private"),
    DriveScope("actas", "Actas", os.getenv("ACTAS_FOLDER_ID", "1dJpIGV-i6kvu6gTkeTphpz9uopvHO2MR"), "documentacion/actas/", "MIGRATE_PRIVATE", "private"),
    DriveScope("concertos_documentos", "Programas de conciertos", os.getenv("CONCERTOS_FILES_FOLDER_ID", "1H12S32zJzncJoXdUvbZx82CLFXvlhtd6"), "concertos/documentos/", "MIGRATE_PRIVATE", "private"),
    DriveScope("concertos_imaxes", "Carteles e imágenes de conciertos", os.getenv("CONCERTOS_IMAGES_FOLDER_ID", "1yvEWIatZIa3UnE71VQUb4LCvBZ6HLs6t"), "concertos/imaxes/", "REVIEW_PUBLIC_R2", "public"),
    DriveScope("perfil_fotos", "Fotos de perfil", os.getenv("PERFIL_FOTOS_FOLDER_ID", "1qXPUplggCFbFTTLRtm2j16af717o-bQs"), "persoas/perfis/", "MIGRATE_PRIVATE", "private"),
    DriveScope("persoas_fichas", "Fichas de personas", os.getenv("FICHAS_FOLDER_ID", "1UmEo1fP5jyxxo90dQbXG6SM2SrmdysbN"), "persoas/fichas/", "VERIFY_MANAGED", "private"),
    DriveScope("repertorio", "Audios de repertorio", os.getenv("AUDIO_FOLDER_ID", "1QAt_iu_C2m7jfoTfC9dh5SePWNf0iULU"), "repertorio/audios/", "VERIFY_MANAGED", "private"),
    DriveScope("partituras", "Partituras", os.getenv("PARTITURA_FOLDER_ID", "1ZbqnD4Gda7gkJrQOLE-eNhiLboz7iqJm"), "partituras/", "VERIFY_MANAGED", "private"),
    DriveScope("fotos", "Fotografías", os.getenv("FOTOS_FOLDER_ID", "1FySxDvTHVNC20-a3I0wDU1v0s82VRiix"), "fotos/", "VERIFY_MANAGED", "private"),
]

LEGACY_PATTERNS = {
    "DRIVE_BINARY": re.compile(r"DriveApp\.(?:getFolderById|getFileById)|getBlob\(\)", re.I),
    "BASE64_BINARY": re.compile(r"base64Encode|resultado\.base64|fotoDataUrl|fotoBase64", re.I),
    "GITHUB_MEDIA_SYNC": re.compile(r"sincronizarMediosConcertos|subirOuActualizarGitHub", re.I),
}


def credentials():
    return service_account.Credentials.from_service_account_info(
        json.loads(os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"]), scopes=SCOPES
    )


def r2_client():
    account_id = os.environ["R2_ACCOUNT_ID"]
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
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
                fields="nextPageToken,files(id,name,mimeType,size,modifiedTime,md5Checksum,parents)",
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


def scan_legacy_code():
    rows = defaultdict(list)
    roots = [ROOT / "functions", ROOT / "scripts", ROOT / "apps-script", ROOT / "public" / "js"]
    for base in roots:
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if path.suffix.lower() not in {".js", ".gs", ".py"}:
                continue
            text = path.read_text(encoding="utf-8", errors="replace")
            for code, pattern in LEGACY_PATTERNS.items():
                if pattern.search(text):
                    rows[code].append(path.relative_to(ROOT).as_posix())
    return rows


def text_references():
    references = Counter()
    for base in [ROOT / "src", ROOT / "public", ROOT / "functions"]:
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if path.suffix.lower() not in {".astro", ".js", ".ts", ".css", ".html", ".json"}:
                continue
            text = path.read_text(encoding="utf-8", errors="replace")
            for match in re.findall(r"/(?:img|docs|documentos)/[^\s'\"?#)]+", text):
                references[match] += 1
    return references


def static_assets():
    refs = text_references()
    assets = []
    public = ROOT / "public"
    if not public.exists():
        return assets
    for path in public.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in FILE_EXTENSIONS:
            continue
        rel = path.relative_to(public).as_posix()
        url = "/" + rel
        category = "stable-pages"
        recommendation = "KEEP_PAGES_STATIC"
        if rel.startswith("img/concertos/"):
            category, recommendation = "concertos-repo", "REVIEW_PUBLIC_R2"
        elif rel.startswith("documentos/publicacions/"):
            category, recommendation = "publicacions-repo", "REVIEW_PUBLIC_R2"
        assets.append({
            "path": rel,
            "size": path.stat().st_size,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "references": refs[url],
            "category": category,
            "recommendation": recommendation,
        })
    return assets


def prefix_stats(objects, prefix: str):
    selected = [item for item in objects if str(item.get("Key", "")).startswith(prefix)]
    return len(selected), sum(int(item.get("Size", 0)) for item in selected)


def write_reports(payload, findings):
    REPORT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    with REPORT_CSV.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.writer(handle)
        writer.writerow(["severity", "code", "scope", "count", "size", "detail"])
        for item in findings:
            writer.writerow([item.severity, item.code, item.scope, item.count, item.size, item.detail])

    drive = payload.get("drive", [])
    static = payload.get("static", [])
    legacy = payload.get("legacy", {})
    lines = [
        "# Auditoría global de archivos",
        "",
        "Auditoría de solo lectura. No se subió, movió ni eliminó ningún archivo.",
        "",
        "## Orígenes Drive",
        "",
        "| Ámbito | Archivos | Tamaño | R2 actual | Decisión |",
        "|---|---:|---:|---:|---|",
    ]
    for item in drive:
        lines.append(f"| {item['label']} | {item['count']} | {item['size']} | {item['r2_count']} | {item['decision']} |")
    lines.extend([
        "",
        "## Archivos incluidos en Pages",
        "",
        f"- Recursos estáticos totales: **{len(static)}**.",
        f"- Tamaño total: **{sum(x['size'] for x in static)} bytes**.",
        f"- Medios de conciertos que requieren revisión: **{sum(1 for x in static if x['category'] == 'concertos-repo')}**.",
        f"- PDFs de publicaciones que requieren revisión: **{sum(1 for x in static if x['category'] == 'publicacions-repo')}**.",
        "",
        "## Código heredado",
        "",
    ])
    for code, paths in legacy.items():
        lines.append(f"- **{code}**: {len(paths)} archivos de código.")
    lines.extend([
        "",
        "## Recomendación",
        "",
        "1. Migrar primero Documentación y Actas a R2 privado.",
        "2. Migrar después programas de mano de conciertos.",
        "3. Diseñar el cambio de fotos de perfil manteniendo Drive como entrada y respaldo.",
        "4. Decidir si carteles e imágenes de conciertos pasan a R2 público antes de retirar la sincronización a GitHub.",
        "5. Mantener en Pages los recursos editoriales históricos y estables.",
    ])
    REPORT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")


def audit():
    drive = build("drive", "v3", credentials=credentials(), cache_discovery=False)
    r2 = r2_client()
    bucket = os.environ["R2_BUCKET"]
    r2_objects = list_r2(r2, bucket)
    drive_results, findings = [], []

    for scope in DRIVE_SCOPES:
        try:
            files = list_drive_files(drive, scope.folder_id)
            total_size = sum(int(item.get("size", 0) or 0) for item in files)
            r2_count, r2_size = prefix_stats(r2_objects, scope.target)
            drive_results.append({
                "code": scope.code, "label": scope.label, "count": len(files),
                "size": total_size, "r2_prefix": scope.target, "r2_count": r2_count,
                "r2_size": r2_size, "decision": scope.decision, "privacy": scope.privacy,
            })
            if scope.decision.startswith("MIGRATE") and files:
                findings.append(Finding("ACTION", scope.decision, scope.code, "Archivos pendientes de catálogo y migración conservadora", len(files), total_size))
            if scope.decision == "VERIFY_MANAGED" and files and not r2_count:
                findings.append(Finding("WARNING", "R2_PREFIX_EMPTY", scope.code, scope.target, len(files), total_size))
        except Exception as exc:
            drive_results.append({
                "code": scope.code, "label": scope.label, "count": 0, "size": 0,
                "r2_prefix": scope.target, "r2_count": 0, "r2_size": 0,
                "decision": scope.decision, "privacy": scope.privacy, "error": str(exc),
            })
            findings.append(Finding("WARNING", "DRIVE_SCOPE_UNAVAILABLE", scope.code, str(exc)))

    legacy = scan_legacy_code()
    assets = static_assets()
    for code, paths in legacy.items():
        findings.append(Finding("ACTION", code, "code", ", ".join(paths), len(paths)))
    for category in ("concertos-repo", "publicacions-repo"):
        selected = [item for item in assets if item["category"] == category]
        if selected:
            findings.append(Finding("REVIEW", "REPO_DYNAMIC_ASSETS", category, "Evaluar R2 público", len(selected), sum(x["size"] for x in selected)))

    payload = {
        "version": 1,
        "read_only": True,
        "drive": drive_results,
        "r2": {
            "objects": len(r2_objects),
            "size": sum(int(item.get("Size", 0)) for item in r2_objects),
            "top_prefixes": Counter(str(item.get("Key", "")).split("/", 1)[0] for item in r2_objects),
        },
        "static": assets,
        "legacy": legacy,
    }
    payload["r2"]["top_prefixes"] = dict(payload["r2"]["top_prefixes"])
    write_reports(payload, findings)
    print(f"Auditoría completada: {len(drive_results)} ámbitos Drive, {len(r2_objects)} objetos R2, {len(assets)} recursos Pages")
    print(f"Informes: {REPORT_MD}, {REPORT_CSV}, {REPORT_JSON}")
    return 0


def main():
    try:
        return audit()
    except Exception as exc:
        traceback.print_exc()
        finding = Finding("ERROR", "AUDIT_EXECUTION_FAILED", "global", f"{type(exc).__name__}: {exc}")
        write_reports({"version": 1, "read_only": True, "drive": [], "r2": {}, "static": [], "legacy": {}}, [finding])
        return 2


if __name__ == "__main__":
    sys.exit(main())
