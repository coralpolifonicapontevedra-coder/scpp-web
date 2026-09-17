#!/usr/bin/env python3
import json, os, time
import boto3
from google.oauth2 import service_account
from googleapiclient.discovery import build

SHEET_ID = '1Hg_ZWsC6a7Sj-OCwRGyywzTJqqsIxUsAshk02yE9Enw'
TAB = 'Repertorio'
ADMIN_KEY = 'repertorio/cache/administracion/main/listado-v2.json'
CATALOGO_KEY = 'repertorio/cache/catalogo.json'
DRAFT_PREFIX = 'concertos/borradores-v1/main/'
SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly']

def clean(v): return str(v or '').strip()

def canon(v):
    s = clean(v)
    try: return str(int(float(s.replace(',', '.'))))
    except Exception: return s

def creds():
    return service_account.Credentials.from_service_account_info(json.loads(os.environ['GOOGLE_SERVICE_ACCOUNT_JSON']), scopes=SCOPES)

def rows():
    svc = build('sheets','v4',credentials=creds(),cache_discovery=False)
    vals = svc.spreadsheets().values().get(spreadsheetId=SHEET_ID, range=f'{TAB}!A:Z', valueRenderOption='FORMATTED_VALUE').execute().get('values',[])
    if not vals: return []
    headers=[clean(x) for x in vals[0]]
    out=[]
    for raw in vals[1:]:
        raw=list(raw)+['']*(len(headers)-len(raw))
        out.append(dict(zip(headers,[clean(x) for x in raw])))
    return out

def client():
    return boto3.client('s3', endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com", aws_access_key_id=os.environ['R2_ACCESS_KEY_ID'], aws_secret_access_key=os.environ['R2_SECRET_ACCESS_KEY'], region_name='auto')

def getj(c,b,k):
    try: return json.loads(c.get_object(Bucket=b,Key=k)['Body'].read().decode())
    except Exception: return None

def putj(c,b,k,v,meta=None):
    kw={}
    if meta: kw['Metadata']={str(a):str(z) for a,z in meta.items()}
    c.put_object(Bucket=b,Key=k,Body=json.dumps(v,ensure_ascii=False,separators=(',',':')).encode(),ContentType='application/json; charset=utf-8',CacheControl='private, no-store',**kw)

def listkeys(c,b,prefix):
    token=None
    while True:
        kw={'Bucket':b,'Prefix':prefix}
        if token: kw['ContinuationToken']=token
        page=c.list_objects_v2(**kw)
        for x in page.get('Contents',[]): yield x['Key']
        if not page.get('IsTruncated'): break
        token=page.get('NextContinuationToken')

def main():
    obras_rows=rows()
    works=[]
    byid={}
    for r in obras_rows:
        i=canon(r.get('Id')); n=clean(r.get('NomeObra'))
        if not i or not n: continue
        w={'id':i,'nome':n,'autor':clean(r.get('Compositor'))}
        works.append(w); byid[i]=r
    works.sort(key=lambda x:x['nome'].casefold())
    assert '90' in byid, 'Falta obra 90 na Sheet'
    print('Obra 90 Sheet:', byid['90'].get('NomeObra'))
    print("Cantas Sheet:", ', '.join(w['nome'] for w in works if 'canta' in w['nome'].casefold()))

    c=client(); b=os.environ['R2_BUCKET']; now=int(time.time()*1000)

    admin=getj(c,b,ADMIN_KEY) or {'payload':{'ok':True,'partituras':[],'audios':[]}}
    admin.setdefault('payload',{})['ok']=True
    admin['payload']['obras']=obras_rows
    admin['gardadoEn']=now
    putj(c,b,ADMIN_KEY,admin,{'tipo':'repertorio-admin-cache'})

    catalog=getj(c,b,CATALOGO_KEY) or {'ok':True,'obras':[]}
    old={canon(o.get('id')):o for o in catalog.get('obras',[]) if isinstance(o,dict)}
    new=[]
    for w in works:
        r=byid[w['id']]; o=dict(old.get(w['id'],{}))
        o.update({'id':w['id'],'nomeObra':w['nome'],'autorLetra':clean(r.get('AutorLetra')),'compositor':w['autor'],'datas':clean(r.get('Nac/fall')),'comentarios':clean(r.get('Comentarios')),'categoria':clean(r.get('Categoria')),'coleccion':clean(r.get('Coleccion')),'estadoObra':clean(r.get('EstadoObra'))})
        o.setdefault('partituras',[]); o.setdefault('audios',[]); o.setdefault('concertos',[]); o.setdefault('partiturasR2',o['partituras']); o.setdefault('audiosR2',o['audios']); o['tenRecursosR2']=bool(o.get('partituras') or o.get('audios'))
        new.append(o)
    catalog['ok']=True; catalog['obras']=new
    catalog['cacheMeta']={'savedAt':now,'source':'FAST-SHEET-WORKS-REFRESH','branch':'main','version':'repertorio-cache-v3-sheet-authority'}
    putj(c,b,CATALOGO_KEY,catalog,{'tipo':'repertorio-catalogo'})

    n=0
    for k in listkeys(c,b,DRAFT_PREFIX):
        d=getj(c,b,k)
        if not isinstance(d,dict): continue
        d['obras']=works; d['catalogoRepertorio']='FAST-SHEET-WORKS-REFRESH'; d['updatedAt']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
        putj(c,b,k,d,{'tipo':'borrador-concerto','version':'1'}); n+=1
    print('Obras publicadas:',len(works))
    print('Borradores actualizados:',n)
    print('OK obra 90 e lista Canta refrescadas en R2')

if __name__=='__main__': main()
