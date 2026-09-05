from pathlib import Path

GL=Path('src/pages/historia.astro')
ES=Path('src/pages/es/historia.astro')

def apply(path, spanish=False):
    text=path.read_text(encoding='utf-8')
    old='<div class="castelao-emblem-mark">SCPP</div>'
    if old not in text:
        raise SystemExit(f'Non se atopou o marcador SCPP en {path}')
    if spanish:
        new='''<div class="castelao-emblem-visuals">
          <img class="castelao-emblem-main" src="/api/galeria-orixinal?ruta=fotos%2Forixinais%2F373c7089-3234-430a-b035-7eb3b86beb80.jpg" alt="Anagrama de San David diseñado por Castelao para la Sociedad Coral Polifónica de Pontevedra" loading="lazy" />
          <figure class="castelao-emblem-history"><img src="/api/galeria-orixinal?ruta=fotos%2Forixinais%2F3ee29336-fc4d-4a1f-97a9-e1575291494c.jpg" alt="Versión histórica del anagrama de San David con firma de Castelao" loading="lazy" /><figcaption>Versión histórica con firma · Archivo SCPP</figcaption></figure>
        </div>'''
    else:
        new='''<div class="castelao-emblem-visuals">
          <img class="castelao-emblem-main" src="/api/galeria-orixinal?ruta=fotos%2Forixinais%2F373c7089-3234-430a-b035-7eb3b86beb80.jpg" alt="Anagrama de San David deseñado por Castelao para a Sociedade Coral Polifónica de Pontevedra" loading="lazy" />
          <figure class="castelao-emblem-history"><img src="/api/galeria-orixinal?ruta=fotos%2Forixinais%2F3ee29336-fc4d-4a1f-97a9-e1575291494c.jpg" alt="Versión histórica do anagrama de San David coa sinatura de Castelao" loading="lazy" /><figcaption>Versión histórica con sinatura · Arquivo SCPP</figcaption></figure>
        </div>'''
    text=text.replace(old,new,1)
    css='''
  .castelao-emblem-visuals { display:grid; gap:.8rem; align-content:start; }
  .castelao-emblem-main { width:100%; max-width:180px; margin:0 auto; display:block; object-fit:contain; background:#fff; border:1px solid rgba(107,29,47,.18); padding:.45rem; }
  .castelao-emblem-history { margin:0; }
  .castelao-emblem-history img { width:100%; max-width:180px; margin:0 auto; display:block; object-fit:contain; }
  .castelao-emblem-history figcaption { margin-top:.35rem; color:var(--muted); font-size:.68rem; line-height:1.35; text-align:center; }
'''
    if '.castelao-emblem-visuals {' not in text:
        text=text.replace('</style>',css+'\n</style>')
    path.write_text(text,encoding='utf-8')

apply(GL,False)
apply(ES,True)
print('Logos de San David integrados nas dúas versións')
