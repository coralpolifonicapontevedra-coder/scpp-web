#!/usr/bin/env python3
import io, json, os, hashlib
import boto3
from PIL import Image, ImageOps
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

ITEMS = [
    {"drive":"1bgjmpZvhG-mlN0-V5apXBrIYsqqs0d1d","id":"373c7089-3234-430a-b035-7eb3b86beb80","title":"Logo de San David deseñado por Castelao","source":"Panos castelao/Logo San David.jpg"},
    {"drive":"1jDD3iandTgYTx9uksXmavAZxi7iu-HNW","id":"3ee29336-fc4d-4a1f-97a9-e1575291494c","title":"San David histórico con sinatura de Castelao","source":"Panos castelao/Logo San David3.png"},
]
BUCKET='scpp-publico'; INDEX_KEY='indices/galeria-publica-v1.json'

def req(n):
    v=(os.environ.get(n) or '').strip()
    if not v: raise RuntimeError(f'Falta {n}')
    return v

def download(drive, file_id):
    out=io.BytesIO(); dl=MediaIoBaseDownload(out, drive.files().get_media(fileId=file_id)); done=False
    while not done: _,done=dl.next_chunk()
    return out.getvalue()

def render(data,size,fmt,quality):
    with Image.open(io.BytesIO(data)) as im:
        im=ImageOps.exif_transpose(im)
        if im.mode=='RGBA':
            bg=Image.new('RGB',im.size,'white'); bg.paste(im,mask=im.getchannel('A')); im=bg
        elif im.mode!='RGB': im=im.convert('RGB')
        im.thumbnail(size,Image.Resampling.LANCZOS)
        out=io.BytesIO()
        if fmt=='JPEG': im.save(out,'JPEG',quality=quality,optimize=True,progressive=True)
        else: im.save(out,'WEBP',quality=quality,method=6)
        return out.getvalue()

def main():
    info=json.loads(req('GOOGLE_SERVICE_ACCOUNT_JSON'))
    creds=service_account.Credentials.from_service_account_info(info,scopes=['https://www.googleapis.com/auth/drive.readonly'])
    drive=build('drive','v3',credentials=creds,cache_discovery=False)
    r2=boto3.client('s3',endpoint_url=f"https://{req('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com",aws_access_key_id=req('R2_ACCESS_KEY_ID'),aws_secret_access_key=req('R2_SECRET_ACCESS_KEY'),region_name='auto')
    try: current=json.loads(r2.get_object(Bucket=BUCKET,Key=INDEX_KEY)['Body'].read())
    except Exception: current={'ok':True,'fotos':[]}
    fotos=list(current.get('fotos',[])); byid={str(x.get('idFoto') or x.get('Id_Foto') or ''):x for x in fotos}
    results=[]
    for item in ITEMS:
        source=download(drive,item['drive']); original=render(source,(2400,2400),'JPEG',94); thumb=render(source,(900,900),'WEBP',86)
        digest=hashlib.sha256(original).hexdigest(); okey=f"fotos/orixinais/{item['id']}.jpg"; tkey=f"miniaturas/galeria/{item['id']}.webp"
        r2.put_object(Bucket=BUCKET,Key=okey,Body=original,ContentType='image/jpeg',CacheControl='public, max-age=31536000, immutable',Metadata={'idfoto':item['id'],'orixe':'drive-panos-castelao-san-david'})
        r2.put_object(Bucket=BUCKET,Key=tkey,Body=thumb,ContentType='image/webp',CacheControl='public, max-age=31536000, immutable',Metadata={'idfoto':item['id'],'source-etag':digest})
        target=byid.get(item['id'])
        if target is None:
            target={'idFoto':item['id']}; fotos.append(target); byid[item['id']]=target
        target.update({'titulo':item['title'],'rutaR2Publica':okey,'rutaMiniaturaPublica':tkey,'urlPublica':f'/arquivos/publico/{okey}?v={digest[:16]}','urlMiniaturaPublica':f'/arquivos/publico/{tkey}?v={digest[:16]}','orixinalVerificado':True,'orixe':item['source']})
        results.append({'idFoto':item['id'],'rutaR2':okey,'sha256':digest})
    current['fotos']=fotos
    r2.put_object(Bucket=BUCKET,Key=INDEX_KEY,Body=json.dumps(current,ensure_ascii=False,separators=(',',':')).encode(),ContentType='application/json; charset=utf-8',CacheControl='public, max-age=0, no-cache, must-revalidate')
    print(json.dumps({'ok':True,'items':results}))
if __name__=='__main__': main()
