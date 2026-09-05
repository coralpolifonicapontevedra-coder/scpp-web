from pathlib import Path
import re

path = Path('src/pages/historia.astro')
text = path.read_text(encoding='utf-8')

panos_block = r'''const panos = [
  {
    titulo: 'San David',
    ano: '1926',
    subtitulo: 'Pano de boca',
    texto: 'Foi un dos cinco panos preparados para o primeiro gran concerto civil da Polifónica, celebrado no Teatro Principal de Pontevedra o 23 de marzo de 1926. A figura do rei David músico converteuse nun dos sinais visuais máis recoñecibles da Sociedade.',
    ficha: ''
  },
  {
    titulo: 'Sala dos Quiquiriquís',
    ano: '1926',
    subtitulo: 'Sala para música profana · inv. 007628',
    texto: 'Concibida para a parte profana do programa, formou parte do primeiro conxunto de 1926. O Museo de Pontevedra conserva o pano, composto por cinco partes, en depósito da Sociedade Coral Polifónica.',
    ficha: 'https://museo.depo.gal/es/coleccion/explora-a-coleccion/-/patrimonio/35834'
  },
  {
    titulo: 'Rosetón oxival',
    ano: '1926',
    subtitulo: 'Un dos decorados máis celebrados',
    texto: 'O gran rosetón oxival converteu o escenario nun espazo de forte presenza arquitectónica. A documentación do Museo sinala que foi un dos decorados máis admirados da Polifónica desde os seus primeiros concertos.',
    ficha: ''
  },
  {
    titulo: 'Alcoba',
    ano: '1926',
    subtitulo: 'Escenografía para o primeiro concerto · inv. 007632',
    texto: 'Tamén pertence ao conxunto dos cinco panos estreado o 23 de marzo de 1926. Fronte á monumentalidade das arquitecturas relixiosas, propón un ambiente máis íntimo adaptado ao repertorio.',
    ficha: 'https://museo.depo.gal/es/coleccion/explora-a-coleccion/-/patrimonio/35839'
  },
  {
    titulo: 'Interior de igrexa',
    ano: '1926',
    subtitulo: '493 × 782 cm · inv. 007630',
    texto: 'Estreouse en Pontevedra en abril de 1926. A arquitectura relixiosa ocupa todo o fondo escénico e prolonga visualmente o carácter sacro da música interpretada pola Coral.',
    ficha: 'https://museo.depo.gal/es/coleccion/explora-a-coleccion/-/patrimonio/35838'
  },
  {
    titulo: 'Arco da vella',
    ano: '1926',
    subtitulo: 'Segundo pano de boca',
    texto: 'Foi estreado en decembro de 1926 no Teatro Rosalía de Castro da Coruña. A súa composición emprega o arco da vella como motivo central nunha proposta de gran forza gráfica.',
    ficha: ''
  },
  {
    titulo: 'Claustro',
    ano: 'c. 1926–1927',
    subtitulo: 'Arquitectura medieval imaxinada',
    texto: 'Escenografía de carácter arquitectónico asociada ao repertorio relixioso. A tradición documental da Polifónica e do Museo sitúaa dentro do conxunto conservado das creacións escénicas de Castelao.',
    ficha: ''
  },
  {
    titulo: 'Capela oxival',
    ano: '1934',
    subtitulo: 'Último pano para a Polifónica · inv. 007629',
    texto: 'Foi o último pano realizado por Castelao para a Sociedade. Estreouse no Teatro Principal de Pontevedra o 16 de novembro de 1934. O conxunto está formado por grandes paneis que superan os cinco metros e medio de altura.',
    ficha: 'https://museo.depo.gal/es/coleccion/explora-a-coleccion/-/patrimonio/35837'
  }
];

const panosDesaparecidos = [
  {
    titulo: 'Pórtico románico',
    ano: '1926',
    texto: 'Formou parte dos cinco panos do concerto do 23 de marzo de 1926. O pano desapareceu, pero se conserva documentación preparatoria e fotografías históricas que permiten coñecer a súa composición.'
  },
  {
    titulo: 'Rúa',
    ano: '1926',
    texto: 'Estreouse no Teatro Principal de Santiago en abril de 1926. É a outra escenografía de Castelao para a Polifónica que non chegou ata nós e coñécese grazas á documentación fotográfica.'
  }
];

const legado ='''

text, n = re.subn(
    r"const panos = \[.*?\];\n\n(?:const panosDesaparecidos = \[.*?\];\n\n)?const legado =",
    panos_block,
    text,
    count=1,
    flags=re.S,
)
if n != 1:
    raise SystemExit('Non se atopou o bloque de panos')

panel = r'''      <!-- 05 CASTELAO E A ESCENA -->
      <div id="panel-castelao" class="archive-panel" role="tabpanel">
        <header class="section-heading castelao-heading">
          <p class="section-kicker">Arte, música e patrimonio</p>
          <h2>Castelao: unha escena para a voz</h2>
          <p>
            Fundador da Sociedade, cantor baixo e presidente entre 1929 e 1932, Castelao
            fixo da escenografía unha parte esencial da personalidade artística da Polifónica.
            O escenario deixaba de ser un simple fondo para converterse nunha prolongación da música.
          </p>
        </header>

        <section class="castelao-story" aria-labelledby="castelao-teatro-arte">
          <div class="castelao-story-year">1921</div>
          <div>
            <p class="section-kicker">A orixe da idea</p>
            <h3 id="castelao-teatro-arte">Un teatro de arte para Galicia</h3>
            <p>
              Durante a súa estancia en París, Castelao asistiu ás representacións dos coros ucraínos
              e do Teatro do Morcego de Nikita Balieff. Aquelas novas fórmulas escénicas alimentaron a
              súa idea de crear en Galicia un teatro de arte e acabarían tendo unha aplicación singular
              nos concertos da Sociedade Coral Polifónica.
            </p>
          </div>
        </section>

        <section class="castelao-story castelao-story-emphasis">
          <div class="castelao-story-year">1926</div>
          <div>
            <p class="section-kicker">23 de marzo · Teatro Principal</p>
            <h3>Cinco panos para un concerto novo</h3>
            <p>
              Para a primeira actuación da Coral nun espazo civil, Castelao deseñou San David,
              Sala dos Quiquiriquís, Pórtico románico, Rosetón oxival e Alcoba. O tamaño das pezas
              obrigou a traballar na Casa da Luz. Foron realizadas en augada e tinta sobre papel,
              cunha escala monumental e cunha concepción pensada para dialogar co repertorio.
            </p>
          </div>
        </section>

        <section class="castelao-video-block" aria-labelledby="video-castelao-title">
          <div class="castelao-video-copy">
            <p class="section-kicker">Museo de Pontevedra</p>
            <h3 id="video-castelao-title">As escenografías da Polifónica explicadas no Museo</h3>
            <p>
              O Museo de Pontevedra dedicou ao centenario da Sociedade un apartado monográfico aos panos
              de Castelao. Neste vídeo explícanse a súa concepción, aparición pública, conservación e restauración.
            </p>
          </div>
          <div class="video-frame">
            <iframe
              src="https://www.youtube-nocookie.com/embed/norAzpSJ1cM"
              title="Museo de Pontevedra: escenografías de Castelao para a Sociedade Coral Polifónica"
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowfullscreen
            ></iframe>
          </div>
        </section>

        <div class="castelao-counts" aria-label="Resumo da colección">
          <div><strong>8</strong><span>panos conservados</span></div>
          <div><strong>2</strong><span>panos desaparecidos</span></div>
          <div><strong>1926–1934</strong><span>período de creación</span></div>
        </div>

        <div class="pano-section-title">
          <p class="section-kicker">Colección conservada</p>
          <h3>Os oito panos custodiados polo Museo</h3>
          <p>O Museo de Pontevedra conserva estas escenografías en depósito da Sociedade Coral Polifónica.</p>
        </div>

        <div class="panos-museum-grid">
          {panos.map((pano, index) => (
            <article class="pano-museum-card">
              <div class="pano-card-index">{String(index + 1).padStart(2, '0')}</div>
              <div class="pano-card-body">
                <div class="pano-card-topline">
                  <span>{pano.ano}</span>
                  <span>Castelao</span>
                </div>
                <h4>{pano.titulo}</h4>
                <p class="pano-subtitle">{pano.subtitulo}</p>
                <p>{pano.texto}</p>
                <p class="pano-technique">Augada e tinta sobre papel / técnica mixta</p>
                {pano.ficha && (
                  <a class="pano-source-link" href={pano.ficha} target="_blank" rel="noreferrer">
                    Ficha oficial do Museo de Pontevedra ↗
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>

        <section class="lost-panos" aria-labelledby="lost-panos-title">
          <div class="pano-section-title">
            <p class="section-kicker">Memoria documental</p>
            <h3 id="lost-panos-title">Os dous panos desaparecidos</h3>
            <p>O Museo conservou a súa memoria a través de fotografías históricas e material preparatorio.</p>
          </div>
          <div class="lost-panos-grid">
            {panosDesaparecidos.map((pano) => (
              <article>
                <span>{pano.ano}</span>
                <h4>{pano.titulo}</h4>
                <p>{pano.texto}</p>
              </article>
            ))}
          </div>
        </section>

        <section class="castelao-conservation">
          <p class="section-kicker">Patrimonio da Sociedade</p>
          <h3>Unha colección monumental</h3>
          <p>
            As dimensións destes panos explican a dificultade de expoñelos de maneira permanente.
            Na mostra do centenario de 2025 o Museo recorreu a reproducións a escala de varias pezas,
            reservando os orixinais para a súa conservación. O conxunto é unha das testemuñas máis
            singulares da colaboración de Castelao coa Sociedade Coral Polifónica de Pontevedra.
          </p>
          <a class="pano-source-link" href="https://museo.depo.gal/es/-/exposicion-sociedade-coral-polifonica-de-pontevedra-1925-2025" target="_blank" rel="noreferrer">
            Ver a exposición do centenario no Museo de Pontevedra ↗
          </a>
        </section>

        <blockquote class="archive-quote castelao-quote">
          <p>
            A escenografía de Castelao fixo dos concertos da Polifónica unha experiencia na que
            voz, arquitectura, cor e cultura galega formaban parte dunha mesma obra.
          </p>
        </blockquote>
      </div>

      <!-- 06 LEGADO -->'''

text, n = re.subn(
    r"      <!-- 05 CASTELAO E A ESCENA -->.*?      <!-- 06 LEGADO -->",
    panel,
    text,
    count=1,
    flags=re.S,
)
if n != 1:
    raise SystemExit('Non se atopou o panel Castelao')

text = re.sub(
    r"\n\s*/\* CASTELAO_MUSEO_V3_BEGIN \*/.*?/\* CASTELAO_MUSEO_V3_END \*/\n",
    "\n",
    text,
    flags=re.S,
)

css = r'''

  /* CASTELAO_MUSEO_V3_BEGIN */
  .castelao-heading { max-width: 820px; }

  .castelao-story {
    display: grid;
    grid-template-columns: 110px minmax(0, 1fr);
    gap: 2rem;
    margin: 0 0 1px;
    padding: 2.2rem;
    background: #f7f4ef;
    border-left: 3px solid var(--gold);
  }

  .castelao-story-emphasis { background: #efe8df; }
  .castelao-story-year {
    color: var(--wine);
    font-size: 2rem;
    font-weight: 800;
    letter-spacing: -.03em;
  }
  .castelao-story h3,
  .castelao-video-block h3,
  .pano-section-title h3,
  .castelao-conservation h3 {
    margin: 0 0 .85rem;
    color: var(--wine);
    font-size: clamp(1.55rem, 3vw, 2.2rem);
    line-height: 1.15;
  }
  .castelao-story p:last-child,
  .castelao-video-copy p:last-child,
  .pano-section-title > p:last-child,
  .castelao-conservation > p {
    color: #4c4744;
    line-height: 1.75;
  }

  .castelao-video-block {
    margin: 3rem 0;
    padding: clamp(1.3rem, 3vw, 2.4rem);
    background: var(--wine);
    color: white;
  }
  .castelao-video-block h3 { color: white; }
  .castelao-video-copy { max-width: 760px; margin-bottom: 1.4rem; }
  .castelao-video-copy p:last-child { color: rgba(255,255,255,.82); }
  .castelao-video-block .section-kicker { color: #dfbf77; }
  .video-frame {
    position: relative;
    overflow: hidden;
    width: 100%;
    aspect-ratio: 16 / 9;
    background: #171313;
  }
  .video-frame iframe { width: 100%; height: 100%; border: 0; display: block; }

  .castelao-counts {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    margin: 0 0 3.5rem;
    border-top: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
  }
  .castelao-counts div { padding: 1.4rem 1rem; text-align: center; border-right: 1px solid var(--line); }
  .castelao-counts div:last-child { border-right: 0; }
  .castelao-counts strong { display: block; color: var(--wine); font-size: 1.8rem; line-height: 1.1; }
  .castelao-counts span { display: block; margin-top: .35rem; color: var(--muted); font-size: .8rem; text-transform: uppercase; letter-spacing: .08em; }

  .pano-section-title { max-width: 760px; margin: 0 0 1.5rem; }
  .panos-museum-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 1.2rem; margin-bottom: 4rem; }
  .pano-museum-card {
    display: grid;
    grid-template-columns: 48px minmax(0,1fr);
    min-height: 100%;
    border: 1px solid var(--line);
    background: white;
  }
  .pano-card-index {
    padding-top: 1.6rem;
    text-align: center;
    color: var(--gold);
    font-size: .72rem;
    font-weight: 800;
    letter-spacing: .1em;
    border-right: 1px solid var(--line);
  }
  .pano-card-body { padding: 1.55rem; }
  .pano-card-topline { display: flex; justify-content: space-between; gap: 1rem; margin-bottom: .65rem; color: var(--gold); font-size: .7rem; font-weight: 800; letter-spacing: .09em; text-transform: uppercase; }
  .pano-card-body h4 { margin: 0; color: var(--wine); font-size: 1.35rem; }
  .pano-card-body > p { color: #4c4744; line-height: 1.7; }
  .pano-subtitle { margin: .35rem 0 1rem; color: var(--ink) !important; font-size: .83rem; font-weight: 700; }
  .pano-technique { padding-top: .8rem; border-top: 1px solid var(--line); color: var(--muted) !important; font-size: .78rem; }
  .pano-source-link { display: inline-block; margin-top: .35rem; color: var(--wine); font-size: .82rem; font-weight: 700; text-decoration: none; border-bottom: 1px solid rgba(107,29,47,.28); }
  .pano-source-link:hover { border-bottom-color: var(--wine); }

  .lost-panos { margin: 4rem 0; }
  .lost-panos-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 1.2rem; }
  .lost-panos-grid article { padding: 2rem; background: #f5f1ea; border-top: 3px solid var(--wine); }
  .lost-panos-grid span { color: var(--gold); font-size: .72rem; font-weight: 800; letter-spacing: .1em; }
  .lost-panos-grid h4 { margin: .55rem 0; color: var(--wine); font-size: 1.35rem; }
  .lost-panos-grid p { color: #4c4744; line-height: 1.75; }

  .castelao-conservation { margin: 0 0 3rem; padding: clamp(1.5rem, 4vw, 3rem); background: #f7f4ef; }
  .castelao-quote { margin-top: 0; }

  @media (max-width: 700px) {
    .castelao-story { grid-template-columns: 1fr; gap: .7rem; padding: 1.5rem; }
    .castelao-story-year { font-size: 1.45rem; }
    .castelao-counts { grid-template-columns: 1fr; }
    .castelao-counts div { border-right: 0; border-bottom: 1px solid var(--line); }
    .castelao-counts div:last-child { border-bottom: 0; }
    .panos-museum-grid, .lost-panos-grid { grid-template-columns: 1fr; }
  }
  /* CASTELAO_MUSEO_V3_END */
'''

text = text.replace('\n</style>', css + '\n</style>')
path.write_text(text, encoding='utf-8')
print('Castelao e a escena actualizado')
