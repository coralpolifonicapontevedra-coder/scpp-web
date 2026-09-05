from pathlib import Path
import re

GL = Path('src/pages/historia.astro')
ES = Path('src/pages/es/historia.astro')

# --- Galego: engadir San David como emblema histórico ---
gl = GL.read_text(encoding='utf-8')
emblem_gl = '''

        <section class="castelao-emblem-note" aria-labelledby="san-david-emblema-title">
          <div class="castelao-emblem-mark">SCPP</div>
          <div>
            <p class="section-kicker">Identidade visual</p>
            <h3 id="san-david-emblema-title">San David: do pano de boca ao emblema da Polifónica</h3>
            <p>
              A figura central representa o rei David músico. Castelao tomou como referencia o San David músico
              do Pórtico das Praterías da Catedral de Santiago e converteuno no anagrama da Sociedade. A imaxe,
              nacida no primeiro pano de boca de 1926, acabou identificando á Polifónica ao longo das décadas e
              segue formando parte da súa identidade gráfica.
            </p>
            <p class="castelao-emblem-source">
              O pano de San David estreouse no concerto do Teatro Principal do 23 de marzo de 1926 e foi restaurado
              en dúas ocasións, a última no ano 2000.
            </p>
          </div>
        </section>'''

if 'id="san-david-emblema-title"' not in gl:
    pat = r'(<section class="castelao-hero-pano" aria-labelledby="san-david-title">.*?</section>)'
    gl, n = re.subn(pat, r'\1' + emblem_gl, gl, count=1, flags=re.S)
    if n != 1:
        raise SystemExit('Non se atopou o bloque San David en historia galega')

css_gl = '''

  .castelao-emblem-note {
    display: grid;
    grid-template-columns: 110px minmax(0, 1fr);
    gap: 1.6rem;
    margin: -1.2rem 0 3rem;
    padding: 1.65rem 1.8rem;
    border: 1px solid var(--line);
    border-left: 4px solid var(--gold);
    background: #fbf9f5;
  }
  .castelao-emblem-mark {
    display: grid;
    place-items: center;
    min-height: 90px;
    color: var(--wine);
    font-size: 1.1rem;
    font-weight: 800;
    letter-spacing: .16em;
    border: 1px solid rgba(107,29,47,.28);
  }
  .castelao-emblem-note h3 { margin: .15rem 0 .7rem; color: var(--wine); font-size: clamp(1.35rem,2.5vw,1.8rem); }
  .castelao-emblem-note p { margin: 0; color: #4c4744; line-height: 1.7; }
  .castelao-emblem-note .castelao-emblem-source { margin-top: .8rem; color: var(--muted); font-size: .84rem; }
  @media (max-width:700px){ .castelao-emblem-note{grid-template-columns:1fr}.castelao-emblem-mark{min-height:64px} }
'''
if '.castelao-emblem-note {' not in gl:
    gl = gl.replace('</style>', css_gl + '\n</style>')
GL.write_text(gl, encoding='utf-8')

# --- Español: actualizar datos y panel Castelao ---
es = ES.read_text(encoding='utf-8')
panos_es = """const panos=[
['San David','1926 · Telón de boca','El rey David músico se convirtió en la imagen más reconocible del conjunto escénico de Castelao y, con el tiempo, en emblema de la propia Sociedad.'],
['Sala de los Quiquiriquís','1926 · Música profana','Formó parte de los cinco paños del primer gran concierto civil y acompañaba la parte profana del programa.'],
['Rosetón ojival','1926','Uno de los decorados más celebrados de la Polifónica, concebido como una gran arquitectura visual para el repertorio polifónico.'],
['Alcoba','1926','Un ambiente más íntimo dentro del primer conjunto escenográfico estrenado en marzo de 1926.'],
['Interior de iglesia','1926','Estrenado en Pontevedra en abril de 1926, prolongaba visualmente el carácter sacro de la música.'],
['Arcoíris','1926 · Segundo telón de boca','Estrenado en diciembre de 1926 en el Teatro Rosalía de Castro de A Coruña.'],
['Claustro','c. 1926–1927','Una arquitectura medieval imaginada integrada en el conjunto conservado de escenografías de Castelao.'],
['Capilla ojival','1934','El último paño realizado por Castelao para la Sociedad, estrenado en el Teatro Principal de Pontevedra el 16 de noviembre de 1934.']];"""
es, n = re.subn(r'const panos=\[.*?\];', panos_es, es, count=1, flags=re.S)
if n != 1:
    raise SystemExit('Non se atopou const panos na historia española')

panel_es = '''<div id="panel-castelao" class="archive-panel" role="tabpanel">
<header class="section-heading castelao-heading"><p class="section-kicker">Arte, música y patrimonio</p><h2>Castelao: una escena para la voz</h2><p>Fundador de la Sociedad, cantor bajo y presidente entre 1929 y 1932, Castelao convirtió la escenografía en una parte esencial de la personalidad artística de la Polifónica. El escenario dejó de ser un simple fondo para convertirse en una prolongación de la música.</p></header>

<section class="castelao-hero-pano" aria-labelledby="san-david-title-es"><div class="castelao-hero-image"><img src="/api/galeria-orixinal?ruta=fotos%2Forixinais%2Fc5875c20-7c55-536e-8419-32ad2404c70b.jpg" alt="Telón de San David diseñado por Castelao para la Sociedad Coral Polifónica de Pontevedra" loading="eager" /></div><div class="castelao-hero-copy"><p class="section-kicker">1926 · Primer telón de boca</p><h3 id="san-david-title-es">San David</h3><p>Creado para el concierto del Teatro Principal del 23 de marzo de 1926. En el centro aparece el rey David músico, figura que Castelao convirtió en uno de los signos visuales más perdurables de la Coral.</p><p class="pano-photo-credit">Archivo SCPP · Fotografía registrada en Fotos y conservada en R2</p></div></section>

<section class="castelao-emblem-note" aria-labelledby="san-david-emblema-title-es"><div class="castelao-emblem-mark">SCPP</div><div><p class="section-kicker">Identidad visual</p><h3 id="san-david-emblema-title-es">San David: del telón de boca al emblema de la Polifónica</h3><p>Castelao tomó como referencia el San David músico del Pórtico de las Platerías de la Catedral de Santiago y lo transformó en el anagrama de la Sociedad. La imagen nacida en aquel telón de 1926 terminó identificando a la Polifónica durante generaciones y continúa formando parte de su identidad gráfica.</p><p class="castelao-emblem-source">El telón fue restaurado en dos ocasiones, la última en el año 2000.</p></div></section>

<div class="castelao-vignettes"><article><span>1921</span><h3>La idea nace en París</h3><p>Castelao descubre nuevas fórmulas escénicas en las representaciones de los coros ucranianos y del Teatro del Murciélago de Nikita Balieff.</p></article><article><span>1926</span><h3>El escenario se transforma</h3><p>Para el concierto del 23 de marzo crea San David, Sala de los Quiquiriquís, Pórtico románico, Rosetón ojival y Alcoba. Sus dimensiones obligan a trabajar en la Casa da Luz.</p></article><article><span>1934</span><h3>Una colección extraordinaria</h3><p>La serie culmina con Capilla ojival. El Museo de Pontevedra conserva ocho escenografías en depósito de la Sociedad.</p></article></div>

<section class="castelao-video-block"><div class="castelao-video-copy"><p class="section-kicker">Museo de Pontevedra</p><h3>Las escenografías de la Polifónica explicadas en el Museo</h3><p>El Museo explica la concepción, el uso escénico, la conservación y la restauración de este conjunto creado por Castelao.</p></div><div class="video-frame"><iframe src="https://www.youtube-nocookie.com/embed/norAzpSJ1cM" title="Museo de Pontevedra: escenografías de Castelao para la Sociedad Coral Polifónica" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div></section>

<section class="castelao-hero-pano castelao-hero-pano-reverse" aria-labelledby="roseton-title-es"><div class="castelao-hero-image"><img src="/api/galeria-orixinal?ruta=fotos%2Forixinais%2F91630e1a-725d-42c9-9aa5-259e6655ef08.jpg" alt="Telón del Rosetón ojival diseñado por Castelao" loading="lazy" /></div><div class="castelao-hero-copy"><p class="section-kicker">1926 · Arquitectura y música</p><h3 id="roseton-title-es">Rosetón ojival</h3><p>El gran rosetón convierte el escenario en una arquitectura imaginada. Fue uno de los decorados más elogiados de la Polifónica y una de las imágenes que mejor resume la voluntad de unir música y artes plásticas.</p><p class="pano-photo-credit">Archivo SCPP · Roseton.jpg de la carpeta Panos castelao · R2</p></div></section>

<div class="castelao-counts"><div><strong>8</strong><span>paños conservados</span></div><div><strong>2</strong><span>paños desaparecidos</span></div><div><strong>1926–1934</strong><span>periodo de creación</span></div></div>

<div class="pano-section-title"><p class="section-kicker">Colección conservada</p><h3>Los ocho paños custodiados por el Museo</h3><p>El Museo de Pontevedra conserva estas escenografías en depósito de la Sociedad Coral Polifónica.</p></div><div class="panos-museum-grid">{panos.map((pano,index)=><article class="pano-museum-card"><div class="pano-card-index">{String(index+1).padStart(2,'0')}</div><div class="pano-card-body"><div class="pano-card-topline"><span>{pano[1]}</span><span>Castelao</span></div><h4>{pano[0]}</h4><p>{pano[2]}</p></div></article>)}</div>

<section class="lost-panos"><div class="pano-section-title"><p class="section-kicker">Memoria documental</p><h3>Los dos paños desaparecidos</h3></div><div class="lost-panos-grid"><article><span>1926</span><h4>Pórtico románico</h4><p>Formó parte de los cinco paños del concierto del 23 de marzo de 1926. Su composición se conoce gracias a la documentación histórica conservada.</p></article><article><span>1926</span><h4>Calle</h4><p>Se estrenó en el Teatro Principal de Santiago en abril de 1926 y es la otra escenografía perdida de la serie.</p></article></div></section>

<section class="castelao-conservation"><p class="section-kicker">Patrimonio de la Sociedad</p><h3>Un legado que sigue identificando a la Polifónica</h3><p>Los paños hicieron que los conciertos fueran una experiencia artística completa y dejaron una identidad visual que todavía acompaña a la Sociedad. Por sus dimensiones monumentales, los originales se conservan en el Museo de Pontevedra y rara vez pueden exponerse completos.</p><a class="pano-source-link" href="https://museo.depo.gal/es/-/exposicion-sociedade-coral-polifonica-de-pontevedra-1925-2025" target="_blank" rel="noreferrer">Ver la exposición del centenario en el Museo de Pontevedra ↗</a></section>
</div>
'''

es, n = re.subn(r'<div id="panel-castelao".*?(?=<div id="panel-legado")', panel_es, es, count=1, flags=re.S)
if n != 1:
    raise SystemExit('Non se atopou o panel Castelao español')

css_es = '''
.castelao-heading{max-width:820px}.castelao-hero-pano{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(280px,.85fr);gap:0;margin:0 0 2.4rem;border:1px solid var(--line);background:#fff}.castelao-hero-pano-reverse{grid-template-columns:minmax(280px,.85fr) minmax(0,1.15fr)}.castelao-hero-pano-reverse .castelao-hero-image{order:2}.castelao-hero-image img{width:100%;height:100%;min-height:360px;object-fit:contain;display:block;background:#f6f3ee}.castelao-hero-copy{padding:clamp(1.5rem,4vw,3rem);align-self:center}.castelao-hero-copy h3,.castelao-video-block h3,.pano-section-title h3,.castelao-conservation h3,.castelao-emblem-note h3{margin:.1rem 0 .8rem;color:var(--wine);font-size:clamp(1.45rem,3vw,2.1rem)}.castelao-hero-copy p{color:#4c4744;line-height:1.75}.pano-photo-credit{font-size:.76rem;color:var(--muted)!important}.castelao-emblem-note{display:grid;grid-template-columns:110px minmax(0,1fr);gap:1.6rem;margin:0 0 2.5rem;padding:1.65rem 1.8rem;border:1px solid var(--line);border-left:4px solid var(--gold);background:#fbf9f5}.castelao-emblem-mark{display:grid;place-items:center;min-height:90px;color:var(--wine);font-weight:800;letter-spacing:.16em;border:1px solid rgba(107,29,47,.28)}.castelao-emblem-note p{margin:0;color:#4c4744;line-height:1.7}.castelao-emblem-source{margin-top:.8rem!important;color:var(--muted)!important;font-size:.84rem}.castelao-vignettes{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;margin:2.5rem 0;background:var(--line)}.castelao-vignettes article{padding:1.6rem;background:#f7f4ef}.castelao-vignettes span{color:var(--gold);font-weight:800}.castelao-vignettes h3{color:var(--wine);font-size:1.12rem}.castelao-vignettes p{color:#4c4744;line-height:1.65}.castelao-video-block{margin:3rem 0;padding:clamp(1.3rem,3vw,2.4rem);background:var(--wine);color:#fff}.castelao-video-block h3{color:#fff}.castelao-video-copy{max-width:760px;margin-bottom:1.4rem}.castelao-video-copy p{color:rgba(255,255,255,.84)}.video-frame{aspect-ratio:16/9;background:#171313}.video-frame iframe{width:100%;height:100%;border:0}.castelao-counts{display:grid;grid-template-columns:repeat(3,1fr);margin:0 0 3rem;border-block:1px solid var(--line)}.castelao-counts div{text-align:center;padding:1.3rem;border-right:1px solid var(--line)}.castelao-counts div:last-child{border-right:0}.castelao-counts strong{display:block;color:var(--wine);font-size:1.7rem}.castelao-counts span{font-size:.75rem;color:var(--muted);text-transform:uppercase}.pano-section-title{max-width:760px;margin-bottom:1.4rem}.panos-museum-grid,.lost-panos-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}.panos-museum-grid{margin-bottom:3rem}.pano-museum-card{display:grid;grid-template-columns:48px 1fr;border:1px solid var(--line);background:#fff}.pano-card-index{padding-top:1.4rem;text-align:center;color:var(--gold);font-size:.72rem;font-weight:800;border-right:1px solid var(--line)}.pano-card-body{padding:1.4rem}.pano-card-topline{display:flex;justify-content:space-between;gap:1rem;color:var(--gold);font-size:.7rem;font-weight:800;text-transform:uppercase}.pano-card-body h4,.lost-panos-grid h4{color:var(--wine);font-size:1.25rem}.pano-card-body p,.lost-panos-grid p,.castelao-conservation p{color:#4c4744;line-height:1.7}.lost-panos{margin:3rem 0}.lost-panos-grid article{padding:1.6rem;background:#f5f1ea;border-top:3px solid var(--wine)}.lost-panos-grid span{color:var(--gold);font-size:.72rem;font-weight:800}.castelao-conservation{margin:0 0 3rem;padding:clamp(1.5rem,4vw,3rem);background:#f7f4ef}.pano-source-link{color:var(--wine);font-weight:700;text-decoration:none}@media(max-width:700px){.castelao-hero-pano,.castelao-hero-pano-reverse{grid-template-columns:1fr}.castelao-hero-pano-reverse .castelao-hero-image{order:0}.castelao-hero-image img{min-height:240px}.castelao-emblem-note{grid-template-columns:1fr}.castelao-vignettes,.castelao-counts,.panos-museum-grid,.lost-panos-grid{grid-template-columns:1fr}.castelao-counts div{border-right:0;border-bottom:1px solid var(--line)}}
'''
if '.castelao-hero-pano{' not in es:
    es = es.replace('</style>', css_es + '\n</style>')
ES.write_text(es, encoding='utf-8')
print('Historia Castelao actualizada en galego e castelán')
