#!/usr/bin/env python3
import io, json, os, hashlib
import boto3
from PIL import Image, ImageOps
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

DRIVE_FILE_ID = "1KTf89fUf-AyyOZbWqcPlmz3v_gmepjvA"  # copia técnica do Roseton.jpg exacto
PHOTO_ID = "91630e1a-725d-42c9-9aa5-259e6655ef08"
ORIGINAL_KEY = f"fotos/orixinais/{PHOTO_ID}.jpg"
THUMB_KEY = f"miniaturas/galeria/{PHOTO_ID}.webp"
BUCKET = "scpp-publico"
INDEX_KEY = "indices/galeria-publica-v1.json"

def req(name):
    value = (os.environ.get(name) or '').strip()
    if not value: raise RuntimeError(f"Falta {name}")
    return value

def download(drive):
    out = io.BytesIO(); request = drive.files().get_media(fileId=DRIVE_FILE_ID)
    dl = MediaIoBaseDownload(out, request); done = False
    while not done: _, done = dl.next_chunk()
    return out.getvalue()

def render(data, size, fmt, quality):
    with Image.open(io.BytesIO(data)) as im:
        im = ImageOps.exif_transpose(im)
        if im.mode == 'RGBA':
            bg = Image.new('RGB', im.size, 'white'); bg.paste(im, mask=im.getchannel('A')); im = bg
        elif im.mode != 'RGB': im = im.convert('RGB')
        im.thumbnail(size, Image.Resampling.LANCZOS)
        out = io.BytesIO()
        if fmt == 'JPEG': im.save(out, 'JPEG', quality=quality, optimize=True, progressive=True)
        else: im.save(out, 'WEBP', quality=quality, method=6)
        return out.getvalue()

def main():
    info = json.loads(req('GOOGLE_SERVICE_ACCOUNT_JSON'))
    creds = service_account.Credentials.from_service_account_info(info, scopes=['https://www.googleapis.com/auth/drive.readonly'])
    drive = build('drive','v3',credentials=creds,cache_discovery=False)
    r2 = boto3.client('s3', endpoint_url=f"https://{req('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com", aws_access_key_id=req('R2_ACCESS_KEY_ID'), aws_secret_access_key=req('R2_SECRET_ACCESS_KEY'), region_name='auto')
    source = download(drive)
    original = render(source,(2400,2400),'JPEG',92)
    thumb = render(source,(900,680),'WEBP',84)
    digest = hashlib.sha256(original).hexdigest()
    r2.put_object(Bucket=BUCKET,Key=ORIGINAL_KEY,Body=original,ContentType='image/jpeg',CacheControl='public, max-age=31536000, immutable',Metadata={'idfoto':PHOTO_ID,'orixe':'drive-panos-castelao-roseton'})
    r2.put_object(Bucket=BUCKET,Key=THUMB_KEY,Body=thumb,ContentType='image/webp',CacheControl='public, max-age=31536000, immutable',Metadata={'idfoto':PHOTO_ID,'source-etag':digest})
    try:
        current = json.loads(r2.get_object(Bucket=BUCKET,Key=INDEX_KEY)['Body'].read())
    except Exception:
        current = {'ok':True,'fotos':[]}
    fotos = list(current.get('fotos',[]))
    for item in fotos:
        if str(item.get('idFoto') or item.get('Id_Foto') or '') == PHOTO_ID:
            item.update({'titulo':'Pano do Rosetón oxival de Castelao','peFoto':'Pano do Rosetón oxival deseñado por Castelao en 1926 para a Sociedade Coral Polifónica de Pontevedra.','rutaR2Publica':ORIGINAL_KEY,'rutaMiniaturaPublica':THUMB_KEY,'urlPublica':f'/arquivos/publico/{ORIGINAL_KEY}?v={digest[:16]}','urlMiniaturaPublica':f'/arquivos/publico/{THUMB_KEY}?v={digest[:16]}','orixinalVerificado':True,'orixe':'Panos castelao/Roseton.jpg'})
            break
    current['fotos']=fotos
    r2.put_object(Bucket=BUCKET,Key=INDEX_KEY,Body=json.dumps(current,ensure_ascii=False,separators=(',',':')).encode(),ContentType='application/json; charset=utf-8',CacheControl='public, max-age=0, no-cache, must-revalidate')
    print(json.dumps({'ok':True,'idFoto':PHOTO_ID,'rutaR2':ORIGINAL_KEY,'sha256':digest}))

if __name__=='__main__': main()
