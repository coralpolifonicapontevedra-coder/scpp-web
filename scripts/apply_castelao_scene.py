from pathlib import Path
import re

path = Path('src/pages/historia.astro')
text = path.read_text(encoding='utf-8')

panel = r'''      <!-- 05 CASTELAO E A ESCENA -->
      <div id="panel-castelao" class="archive-panel" role="tabpanel">
        <header class="section-heading castelao-heading">
          <p class="section-kicker">Arte, música e patrimonio</p>
          <h2>Castelao: unha escena para a voz</h2>
          <p>
            Castelao non foi só un dos fundadores da Sociedade Coral Polifónica, cantor baixo e
            presidente entre 1929 e 1932. A súa colaboración coa Coral deu lugar a unha das achegas
            máis singulares da nosa historia: unha escenografía concibida para facer visible a música.
          </p>
        </header>

        <section class="castelao-hero-pano" aria-labelledby="san-david-title">
          <div class="castelao-hero-image">
            <img
              src="/api/galeria-orixinal?ruta=fotos%2Forixinais%2Fc5875c20-7c55-536e-8419-32ad2404c70b.jpg"
              alt="Pano de San David deseñado por Castelao para a Sociedade Coral Polifónica de Pontevedra"
              loading="eager"
            />
          </div>
          <div class="castelao-hero-copy">
            <p class="section-kicker">1926 · Pano de boca</p>
            <h3 id="san-david-title">San David</h3>
            <p>
              O rei David músico preside unha das imaxes máis recoñecibles da historia da Polifónica.
              Castelao concibiuno como pano de boca para o primeiro gran concerto civil da Sociedade,
              celebrado no Teatro Principal de Pontevedra o 23 de marzo de 1926.
            </p>
            <p>
              A súa forza non reside só na dimensión monumental. San David resume unha idea nova para
              aquel momento: que a arquitectura, a cor, a pintura e a música puidesen formar parte dunha
              mesma experiencia artística.
            </p>
            <span class="pano-caption">Arquivo SCPP · Fotografía publicada desde R2</span>
          </div>
        </section>

        <section class="castelao-timeline" aria-labelledby="castelao-relato-title">
          <div class="pano-section-title">
            <p class="section-kicker">Da idea ao escenario</p>
            <h3 id="castelao-relato-title">Unha historia en catro momentos</h3>
          </div>
          <div class="castelao-vinetas">
            <article>
              <span>1921</span>
              <h4>París e o teatro de arte</h4>
              <p>Castelao coñece novas fórmulas escénicas, entre elas os coros ucraínos e o Teatro do Morcego de Nikita Balieff. A idea dun espectáculo no que todas as artes dialogan ficará na súa memoria.</p>
            </article>
            <article>
              <span>1925</span>
              <h4>Fundador e cantor baixo</h4>
              <p>Participa na fundación da Sociedade Coral Polifónica e intégrase na propia vida musical da entidade. A súa relación coa Coral é persoal, artística e institucional.</p>
            </article>
            <article>
              <span>1926</span>
              <h4>O escenario transfórmase</h4>
              <p>Para o concerto do 23 de marzo crea San David, Sala dos Quiquiriquís, Pórtico románico, Rosetón oxival e Alcoba. As grandes dimensións obrigan a traballar na Casa da Luz.</p>
            </article>
            <article>
              <span>1934</span>
              <h4>Capela oxival</h4>
              <p>Coa última escenografía coñecida para a Polifónica péchase un ciclo de case unha década no que Castelao converte o escenario coral nunha obra plástica total.</p>
            </article>
          </div>
        </section>

        <section class="castelao-video-block" aria-labelledby="video-castelao-title">
          <div class="castelao-video-copy">
            <p class="section-kicker">Museo de Pontevedra</p>
            <h3 id="video-castelao-title">As escenografías da Polifónica explicadas no Museo</h3>
            <p>
              O Museo de Pontevedra dedica neste vídeo unha explicación específica ás escenografías
              creadas por Castelao para a Sociedade Coral Polifónica: a súa orixe, o seu uso nos concertos
              e os traballos de conservación realizados ao longo do tempo.
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

        <section class="castelao-hero-pano castelao-hero-pano-reverse" aria-labelledby="roseton-title">
          <div class="castelao-hero-image">
            <img
              src="/api/galeria-orixinal?ruta=fotos%2Forixinais%2F91630e1a-725d-42c9-9aa5-259e6655ef08.jpg"
              alt="Pano do Rosetón oxival deseñado por Castelao para a Sociedade Coral Polifónica de Pontevedra"
              loading="lazy"
            />
          </div>
          <div class="castelao-hero-copy">
            <p class="section-kicker">1926 · Arquitectura e música</p>
            <h3 id="roseton-title">Rosetón oxival</h3>
            <p>
              O gran rosetón converte o fondo do escenario nunha arquitectura imaxinada. A escena deixa
              de funcionar como decoración neutra e crea un espazo visual capaz de acompañar o carácter
              do repertorio interpretado pola Coral.
            </p>
            <p>
              É unha das obras que mellor explica a modernidade da proposta de Castelao: poucos elementos,
              unha composición monumental e unha imaxe inmediatamente recoñecible que continúa formando
              parte da memoria visual da Sociedade.
            </p>
            <span class="pano-caption">Arquivo SCPP · Fotografía publicada desde R2</span>
          </div>
        </section>

        <div class="castelao-counts" aria-label="Resumo da colección">
          <div><strong>8</strong><span>panos conservados</span></div>
          <div><strong>2</strong><span>panos desaparecidos</span></div>
          <div><strong>1926–1934</strong><span>período de creación</span></div>
        </div>

        <section class="castelao-legado" aria-labelledby="castelao-legado-title">
          <div class="pano-section-title">
            <p class="section-kicker">O seu legado</p>
            <h3 id="castelao-legado-title">Moito máis ca uns decorados</h3>
            <p>Os panos forman parte dunha maneira de entender a Polifónica na que música, cultura galega e creación plástica avanzan xuntas.</p>
          </div>
          <div class="castelao-vinetas castelao-legado-grid">
            <article>
              <span>01</span>
              <h4>Unha identidade propia</h4>
              <p>A escenografía distinguiu os concertos da Polifónica desde os seus primeiros anos e contribuíu a crear unha personalidade recoñecible dentro e fóra de Galicia.</p>
            </article>
            <article>
              <span>02</span>
              <h4>A música feita imaxe</h4>
              <p>Castelao non concibiu estes fondos como ornamentación. Cada pano participa da atmosfera da obra interpretada e amplía o seu significado sobre o escenario.</p>
            </article>
            <article>
              <span>03</span>
              <h4>Patrimonio da Sociedade</h4>
              <p>O Museo de Pontevedra conserva oito escenografías en depósito da Sociedade Coral Polifónica, un conxunto excepcional pola súa dimensión e pola súa historia.</p>
            </article>
            <article>
              <span>04</span>
              <h4>Memoria viva</h4>
              <p>A súa conservación, estudo e difusión permiten que a relación entre Castelao e a Polifónica siga formando parte do relato cultural de Pontevedra.</p>
            </article>
          </div>
        </section>

        <div class="pano-section-title collection-heading">
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
            <p>O seu aspecto coñécese grazas á documentación fotográfica e aos materiais históricos conservados.</p>
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
          <p class="section-kicker">Conservación</p>
          <h3>Un patrimonio monumental e fráxil</h3>
          <p>
            As grandes dimensións e a propia natureza dos materiais fan especialmente complexa a súa
            conservación e exposición permanente. Na mostra do centenario de 2025 o Museo de Pontevedra
            recorreu a reproducións a escala de varias pezas para achegar este patrimonio ao público sen
            comprometer os orixinais.
          </p>
          <a class="pano-source-link" href="https://museo.depo.gal/es/-/exposicion-sociedade-coral-polifonica-de-pontevedra-1925-2025" target="_blank" rel="noreferrer">
            Ver a exposición do centenario no Museo de Pontevedra ↗
          </a>
        </section>

        <blockquote class="archive-quote castelao-quote">
          <p>
            Con Castelao, a Polifónica non só cantaba diante dun escenario: construía un espazo artístico
            no que a música e a imaxe falaban unha mesma linguaxe.
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
  .castelao-heading { max-width: 860px; }

  .castelao-hero-pano {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(300px, .75fr);
    gap: 0;
    margin: 2.2rem 0 3.2rem;
    border: 1px solid var(--line);
    background: #fff;
  }
  .castelao-hero-pano-reverse .castelao-hero-image { order: 2; }
  .castelao-hero-pano-reverse .castelao-hero-copy { order: 1; }
  .castelao-hero-image { min-height: 420px; background: #211b1c; }
  .castelao-hero-image img { width: 100%; height: 100%; min-height: 420px; object-fit: contain; display: block; }
  .castelao-hero-copy { padding: clamp(1.6rem, 4vw, 3rem); align-self: center; }
  .castelao-hero-copy h3,
  .castelao-video-block h3,
  .pano-section-title h3,
  .castelao-conservation h3 {
    margin: 0 0 .9rem;
    color: var(--wine);
    font-size: clamp(1.6rem, 3vw, 2.3rem);
    line-height: 1.12;
  }
  .castelao-hero-copy > p:not(.section-kicker),
  .pano-section-title > p:last-child,
  .castelao-conservation > p {
    color: #4c4744;
    line-height: 1.75;
  }
  .pano-caption { display: block; margin-top: 1.25rem; padding-top: .8rem; border-top: 1px solid var(--line); color: var(--muted); font-size: .75rem; letter-spacing: .03em; }

  .castelao-timeline,
  .castelao-legado { margin: 3.6rem 0; }
  .castelao-vinetas { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 1rem; }
  .castelao-vinetas article { padding: 1.45rem; background: #f7f4ef; border-top: 3px solid var(--gold); }
  .castelao-vinetas span { color: var(--wine); font-size: .78rem; font-weight: 800; letter-spacing: .08em; }
  .castelao-vinetas h4 { margin: .6rem 0 .75rem; color: var(--wine); font-size: 1.1rem; line-height: 1.2; }
  .castelao-vinetas p { margin: 0; color: #514b48; font-size: .9rem; line-height: 1.65; }
  .castelao-legado-grid article:nth-child(even) { background: #efe8df; }

  .castelao-video-block {
    margin: 3.6rem 0;
    padding: clamp(1.4rem, 3vw, 2.5rem);
    background: var(--wine);
    color: white;
  }
  .castelao-video-block h3 { color: white; }
  .castelao-video-copy { max-width: 780px; margin-bottom: 1.45rem; }
  .castelao-video-copy p:last-child { color: rgba(255,255,255,.84); line-height: 1.75; }
  .castelao-video-block .section-kicker { color: #dfbf77; }
  .video-frame { width: 100%; aspect-ratio: 16 / 9; overflow: hidden; background: #171313; }
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

  .pano-section-title { max-width: 780px; margin: 0 0 1.5rem; }
  .collection-heading { margin-top: 4rem; }
  .panos-museum-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 1rem; margin-bottom: 4rem; }
  .pano-museum-card { display: grid; grid-template-columns: 46px minmax(0,1fr); min-height: 100%; border: 1px solid var(--line); background: white; }
  .pano-card-index { padding-top: 1.5rem; text-align: center; color: var(--gold); font-size: .7rem; font-weight: 800; letter-spacing: .1em; border-right: 1px solid var(--line); }
  .pano-card-body { padding: 1.45rem; }
  .pano-card-topline { display: flex; justify-content: space-between; gap: 1rem; margin-bottom: .6rem; color: var(--gold); font-size: .68rem; font-weight: 800; letter-spacing: .09em; text-transform: uppercase; }
  .pano-card-body h4 { margin: 0; color: var(--wine); font-size: 1.28rem; }
  .pano-card-body > p { color: #4c4744; line-height: 1.65; }
  .pano-subtitle { margin: .35rem 0 .85rem; color: var(--ink) !important; font-size: .8rem; font-weight: 700; }
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

  @media (max-width: 900px) {
    .castelao-hero-pano { grid-template-columns: 1fr; }
    .castelao-hero-pano-reverse .castelao-hero-image,
    .castelao-hero-pano-reverse .castelao-hero-copy { order: initial; }
    .castelao-hero-image,
    .castelao-hero-image img { min-height: 0; }
    .castelao-vinetas { grid-template-columns: repeat(2, minmax(0,1fr)); }
  }

  @media (max-width: 700px) {
    .castelao-vinetas,
    .castelao-counts,
    .panos-museum-grid,
    .lost-panos-grid { grid-template-columns: 1fr; }
    .castelao-counts div { border-right: 0; border-bottom: 1px solid var(--line); }
    .castelao-counts div:last-child { border-bottom: 0; }
    .castelao-hero-copy { padding: 1.35rem; }
  }
  /* CASTELAO_MUSEO_V3_END */
'''

text = text.replace('\n</style>', css + '\n</style>')
path.write_text(text, encoding='utf-8')
print('Castelao e a escena actualizado con San David e Rosetón desde R2')
