from pathlib import Path
import re

path = Path('src/pages/historia.astro')
text = path.read_text(encoding='utf-8')

panos_block = r'''const panos = [
  {
    titulo: 'San David',
    ano: '1926',
    inventario: '',
    medidas: '',
    imaxe: '/img/historia/panos/san-david.webp',
    alt: 'Pano de San David deseñado por Castelao para a Sociedade Coral Polifónica de Pontevedra',
    texto: 'Pano de boca creado para o primeiro gran concerto civil da Polifónica no Teatro Principal. Castelao sitúa no centro a figura do rei David músico e constrúe arredor dela unha imaxe que acabou formando parte da identidade visual da Sociedade.',
    ficha: ''
  },
  {
    titulo: 'Sala dos Quiquiriquís',
    ano: '1926',
    inventario: 'Museo de Pontevedra · inv. 007628',
    medidas: 'Cinco partes · aprox. 464 × 261 cm cada unha',
    imaxe: null,
    alt: '',
    texto: 'Concibida como sala para música profana, pertence ao primeiro conxunto escénico estreado o 23 de marzo de 1926. A decoración incorpora motivos vexetais e un característico friso de galos, os «quiquiriquís» que lle deron o nome popular.',
    ficha: 'https://museo.depo.gal/es/coleccion/explora-a-coleccion/-/patrimonio/35834'
  },
  {
    titulo: 'Rosetón oxival',
    ano: '1926',
    inventario: 'Sociedade Coral Polifónica · Museo de Pontevedra',
    medidas: 'Aprox. 609 × 905 cm',
    imaxe: '/img/historia/panos/roseton-oxival.webp',
    alt: 'Rosetón oxival de Castelao para a Sociedade Coral Polifónica de Pontevedra',
    texto: 'Unha das escenografías máis celebradas de Castelao para a Polifónica. O gran rosetón, inspirado na arquitectura medieval, convertía o escenario nun espazo sacro e permitía integrar visualmente a música polifónica coa arquitectura imaxinada.',
    ficha: ''
  },
  {
    titulo: 'Alcoba',
    ano: '1926',
    inventario: 'Museo de Pontevedra · inv. 007632',
    medidas: '',
    imaxe: null,
    alt: '',
    texto: 'Formou parte dos cinco panos preparados para o concerto do Teatro Principal de marzo de 1926. É unha escenografía de carácter íntimo, concibida para adaptar o ambiente visual do escenario ao repertorio interpretado pola Coral.',
    ficha: 'https://museo.depo.gal/es/coleccion/explora-a-coleccion/-/patrimonio/35839'
  },
  {
    titulo: 'Interior de igrexa',
    ano: '1926',
    inventario: 'Museo de Pontevedra · inv. 007630',
    medidas: '493 × 782 cm',
    imaxe: null,
    alt: '',
    texto: 'Estreado en Pontevedra en abril de 1926. Castelao converte o fondo do escenario nun interior de arquitectura relixiosa, reforzando a dimensión espacial e espiritual das obras sacras do programa.',
    ficha: 'https://museo.depo.gal/es/coleccion/explora-a-coleccion/-/patrimonio/35838'
  },
  {
    titulo: 'Arco da vella',
    ano: '1926',
    inventario: '',
    medidas: '',
    imaxe: null,
    alt: '',
    texto: 'Segundo pano de boca da Polifónica, estreado en decembro de 1926 no Teatro Rosalía de Castro da Coruña. A composición emprega a forza gráfica das sete cores do arco da vella sobre un fondo escuro, cunha linguaxe moi sintética e moderna.',
    ficha: ''
  },
  {
    titulo: 'Claustro',
    ano: 'Década de 1920',
    inventario: 'Depósito da Sociedade Coral Polifónica · Museo de Pontevedra',
    medidas: '',
    imaxe: null,
    alt: '',
    texto: 'Escenografía arquitectónica vinculada ao repertorio relixioso da Polifónica. A tradición documental descríbea como un espazo inspirado na arquitectura medieval galega, pensado para prolongar sobre o escenario a atmosfera monumental da música.',
    ficha: ''
  },
  {
    titulo: 'Capela oxival',
    ano: '1934',
    inventario: 'Museo de Pontevedra · inv. 007629',
    medidas: 'Conxunto de grandes paneis · ata aprox. 568 cm de altura',
    imaxe: null,
    alt: '',
    texto: 'Último pano realizado por Castelao para a Polifónica. Estreouse no Teatro Principal o 16 de novembro de 1934, pouco antes da súa marcha a Badaxoz. A arquitectura oxival e as vidreiras converten a escena nunha gran capela para a música relixiosa.',
    ficha: 'https://museo.depo.gal/es/coleccion/explora-a-coleccion/-/patrimonio/35837'
  }
];

const panosDesaparecidos = [
  {
    titulo: 'Pórtico románico',
    ano: '1926',
    texto: 'Un dos cinco panos do primeiro concerto civil da Polifónica. O pano orixinal non se conserva, aínda que o Museo de Pontevedra custodia material preparatorio e a exposición do centenario recuperou a súa imaxe mediante reprodución documental.'
  },
  {
    titulo: 'Rúa',
    ano: '1926',
    texto: 'Estreado no Teatro Principal de Santiago en abril de 1926. É unha das escenografías desaparecidas e coñécese a través da documentación histórica e fotográfica conservada.'
  }
];

const legado ='''

text, n = re.subn(r"const panos = \[.*?\];\n\nconst legado =", panos_block, text, count=1, flags=re.S)
if n != 1:
    raise SystemExit('Non se atopou o bloque const panos')

panel = r'''      <!-- 05 CASTELAO E A ESCENA -->
      <div id="panel-castelao" class="archive-panel" role="tabpanel">
        <header class="section-heading castelao-heading">
          <p class="section-kicker">Arte, música e patrimonio</p>
          <h2>Castelao: unha escena para a voz</h2>
          <p>
            Castelao non foi só fundador, baixo e presidente da Sociedade. Para os seus concertos
            concibiu un aparato escénico extraordinario no que música, arquitectura, cor e identidade
            galega formaban unha mesma obra. O Museo de Pontevedra conserva oito destas escenografías
            en depósito da Sociedade Coral Polifónica.
          </p>
        </header>

        <div class="castelao-heritage-note">
          <span class="heritage-number">8</span>
          <div>
            <strong>Panos conservados</strong>
            <p>Patrimonio da Sociedade Coral Polifónica custodiado polo Museo de Pontevedra.</p>
          </div>
          <span class="heritage-number">2</span>
          <div>
            <strong>Panos desaparecidos</strong>
            <p>Coñecidos pola documentación, fotografías históricas e bosquexos conservados.</p>
          </div>
        </div>

        <div class="castelao-feature">
          <figure>
            <img src="/img/historia/panos/roseton-oxival.webp" alt="Rosetón oxival de Castelao para a Sociedade Coral Polifónica de Pontevedra" loading="lazy" />
          </figure>
          <div class="castelao-feature-copy">
            <p class="section-kicker">1926 · Teatro Principal</p>
            <h3>Un teatro de arte para a Polifónica</h3>
            <p>
              Para o concerto do 23 de marzo de 1926 Castelao realizou un primeiro conxunto de cinco
              panos monumentais, pintados en augada e tinta sobre papel. A escenografía non era un simple
              fondo: mudaba co repertorio e convertía cada bloque musical nun espazo visual propio.
            </p>
          </div>
        </div>

        <div class="pano-section-title">
          <p class="section-kicker">Colección conservada</p>
          <h3>Os oito panos</h3>
        </div>

        <div class="panos-museum-grid">
          {panos.map((pano, index) => (
            <article class:list={['pano-museum-card', pano.imaxe && 'has-image']}>
              <div class="pano-image-wrap">
                {pano.imaxe ? (
                  <img src={pano.imaxe} alt={pano.alt} loading="lazy" />
                ) : (
                  <div class="pano-image-placeholder" aria-label="Imaxe documental pendente de incorporación">
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <small>Imaxe documental</small>
                  </div>
                )}
              </div>
              <div class="pano-card-body">
                <div class="pano-card-topline">
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <span>{pano.ano}</span>
                </div>
                <h4>{pano.titulo}</h4>
                <p>{pano.texto}</p>
                {(pano.inventario || pano.medidas) && (
                  <dl class="pano-meta">
                    {pano.inventario && <><dt>Custodia</dt><dd>{pano.inventario}</dd></>}
                    {pano.medidas && <><dt>Dimensións</dt><dd>{pano.medidas}</dd></>}
                    <dt>Técnica</dt><dd>Augada e tinta sobre papel / técnica mixta</dd>
                  </dl>
                )}
                {pano.ficha && (
                  <a class="pano-source-link" href={pano.ficha} target="_blank" rel="noreferrer">Ver ficha no Museo de Pontevedra ↗</a>
                )}
              </div>
            </article>
          ))}
        </div>

        <div class="castelao-documentary-photo">
          <img src="/img/historia/panos/romaria-1986.webp" alt="Escena de romaría realizada en 1986 a partir dun bosquexo de Castelao" loading="lazy" />
          <div>
            <p class="section-kicker">A escena continúa</p>
            <h3>A romaría recuperada en 1986</h3>
            <p>
              A colección escénica arredor de Castelao tivo tamén vida posterior. Esta escena de romaría
              foi realizada por Germáns Salvador en 1986 a partir dun bosquexo orixinal de Castelao e
              permite comprender a forza teatral e popular da súa proposta para a Coral.
            </p>
          </div>
        </div>

        <div class="lost-panos">
          <div class="pano-section-title">
            <p class="section-kicker">Memoria documental</p>
            <h3>Os dous panos desaparecidos</h3>
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
        </div>

        <blockquote class="archive-quote castelao-quote">
          <p>
            Nos panos de Castelao, a Polifónica non só cantaba diante dunha escenografía:
            entraba nun espazo artístico creado expresamente para a súa música.
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

css_marker = '/* CASTELAO_MUSEO_V2 */'
css = r'''

  /* CASTELAO_MUSEO_V2 */
  .castelao-heading { max-width: 860px; }

  .castelao-heritage-note {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto minmax(0, 1fr);
    gap: 1rem 1.2rem;
    align-items: center;
    margin: 2.2rem 0 3rem;
    padding: 1.35rem 1.5rem;
    border-top: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
    background: #fbfaf7;
  }

  .heritage-number {
    color: var(--wine);
    font-size: 2.35rem;
    font-weight: 800;
    line-height: 1;
  }

  .castelao-heritage-note strong { color: var(--wine); }
  .castelao-heritage-note p { margin: .2rem 0 0; color: var(--muted); font-size: .9rem; }

  .castelao-feature {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(280px, .8fr);
    gap: clamp(1.6rem, 4vw, 4rem);
    align-items: center;
    margin: 0 0 4rem;
    padding: clamp(1rem, 2.5vw, 2rem);
    background: #f4f0e9;
  }

  .castelao-feature figure { margin: 0; background: #201d1d; }
  .castelao-feature img { display: block; width: 100%; max-height: 620px; object-fit: contain; }
  .castelao-feature-copy h3, .pano-section-title h3, .castelao-documentary-photo h3, .lost-panos h3 {
    margin: 0 0 .9rem;
    color: var(--wine);
    font-size: clamp(1.55rem, 3vw, 2.2rem);
  }
  .castelao-feature-copy p:last-child { margin-bottom: 0; line-height: 1.75; }

  .pano-section-title { margin: 0 0 1.3rem; }

  .panos-museum-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.4rem;
    margin-bottom: 4rem;
  }

  .pano-museum-card {
    display: grid;
    grid-template-columns: minmax(150px, .72fr) minmax(0, 1.28fr);
    min-height: 310px;
    border: 1px solid var(--line);
    background: #fff;
    overflow: hidden;
  }

  .pano-image-wrap { min-height: 100%; background: #eee9e0; }
  .pano-image-wrap img { width: 100%; height: 100%; min-height: 310px; object-fit: cover; display: block; }
  .pano-image-placeholder {
    height: 100%; min-height: 310px; display: grid; place-content: center; gap: .5rem;
    text-align: center; color: #81776f;
    background: linear-gradient(145deg, #f4f1eb, #e9e3d9);
  }
  .pano-image-placeholder span { color: #b49a58; font-size: 2.6rem; font-weight: 300; }
  .pano-image-placeholder small { letter-spacing: .08em; text-transform: uppercase; font-size: .67rem; }

  .pano-card-body { padding: 1.45rem; display: flex; flex-direction: column; }
  .pano-card-topline { display: flex; justify-content: space-between; gap: 1rem; color: var(--gold); font-size: .72rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
  .pano-card-body h4 { margin: .75rem 0 .7rem; color: var(--wine); font-size: 1.38rem; }
  .pano-card-body > p { margin: 0 0 1rem; color: #514c48; line-height: 1.65; }
  .pano-meta { display: grid; grid-template-columns: auto 1fr; gap: .25rem .7rem; margin: auto 0 .8rem; padding-top: .8rem; border-top: 1px solid #eee8df; font-size: .76rem; }
  .pano-meta dt { color: #8b7a50; font-weight: 800; }
  .pano-meta dd { margin: 0; color: #68615b; }
  .pano-source-link { margin-top: auto; color: var(--wine); font-size: .76rem; font-weight: 700; text-decoration: none; }
  .pano-source-link:hover { text-decoration: underline; }

  .castelao-documentary-photo {
    display: grid;
    grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr);
    gap: 2rem;
    align-items: center;
    margin: 0 0 4rem;
    padding: 1.5rem;
    background: var(--wine);
    color: white;
  }
  .castelao-documentary-photo img { width: 100%; max-height: 420px; object-fit: cover; display: block; }
  .castelao-documentary-photo .section-kicker { color: #dfc579; }
  .castelao-documentary-photo h3 { color: #fff; }
  .castelao-documentary-photo p:last-child { color: rgba(255,255,255,.88); line-height: 1.75; }

  .lost-panos { margin: 0 0 3rem; padding-top: 2rem; border-top: 1px solid var(--line); }
  .lost-panos-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
  .lost-panos-grid article { padding: 1.4rem; border-left: 4px solid var(--gold); background: #faf8f4; }
  .lost-panos-grid span { color: var(--gold); font-size: .72rem; font-weight: 800; letter-spacing: .1em; }
  .lost-panos-grid h4 { margin: .45rem 0 .65rem; color: var(--wine); font-size: 1.25rem; }
  .lost-panos-grid p { margin: 0; color: #5b5550; line-height: 1.65; }
  .castelao-quote { margin-top: 3rem; }

  @media (max-width: 900px) {
    .castelao-feature, .castelao-documentary-photo { grid-template-columns: 1fr; }
    .panos-museum-grid { grid-template-columns: 1fr; }
    .castelao-heritage-note { grid-template-columns: auto 1fr; }
  }

  @media (max-width: 620px) {
    .pano-museum-card { grid-template-columns: 1fr; }
    .pano-image-wrap img, .pano-image-placeholder { min-height: 230px; max-height: 380px; }
    .lost-panos-grid { grid-template-columns: 1fr; }
    .castelao-heritage-note { padding: 1rem; }
  }
'''

if css_marker not in text:
    pos = text.rfind('</style>')
    if pos < 0:
        raise SystemExit('Non se atopou </style>')
    text = text[:pos] + css + '\n' + text[pos:]

path.write_text(text, encoding='utf-8')
print('Castelao e a escena actualizado')
