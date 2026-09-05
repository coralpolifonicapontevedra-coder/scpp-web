from pathlib import Path

FILES = {
    Path("src/pages/historia.astro"): {
        "needle": '        <section class="castelao-timeline" aria-labelledby="castelao-relato-title">',
        "block": '''        <!-- CASTELAO_LOGO_V1_BEGIN -->
        <section class="castelao-hero-pano castelao-hero-pano-reverse" aria-labelledby="logo-castelao-title">
          <div class="castelao-hero-image" style="background:#f3f0ea;">
            <img
              src="/api/galeria-orixinal?ruta=fotos%2Forixinais%2F373c7089-3234-430a-b035-7eb3b86beb80.jpg"
              alt="Logotipo histórico da Sociedade Coral Polifónica de Pontevedra deseñado por Castelao"
              loading="lazy"
            />
          </div>
          <div class="castelao-hero-copy">
            <p class="section-kicker">1925 · Identidade visual</p>
            <h3 id="logo-castelao-title">O logotipo da Polifónica</h3>
            <p>
              Castelao deseñou tamén o logotipo da Sociedade Coral Polifónica de Pontevedra. A figura
              representa un músico medieval inspirado no rei David da fachada das Praterías da Catedral
              de Santiago de Compostela, unha imaxe que quedou unida desde os primeiros anos á identidade
              da Sociedade.
            </p>
            <p>
              O nome da Polifónica aparece cunha grafía de inspiración epigráfica, relacionada coas
              investigacións de Castelao sobre as inscricións medievais galegas e coa tradición gráfica
              que acabaría sendo recoñecida como «letra galega».
            </p>
            <a class="pano-source-link" href="https://arde.gal/peza/logotipo-sociedad-coral-polifonica-de-pontevedra" target="_blank" rel="noreferrer">
              Ver a ficha do logotipo en AR\DE ↗
            </a>
            <span class="pano-caption">Arquivo SCPP · Logo San David.jpg · Fotografía publicada desde R2</span>
          </div>
        </section>
        <!-- CASTELAO_LOGO_V1_END -->

'''
    },
    Path("src/pages/es/historia.astro"): {
        "needle": '<section class="castelao-timeline"',
        "block": '''<!-- CASTELAO_LOGO_V1_BEGIN -->
<section class="castelao-hero-pano castelao-hero-pano-reverse" aria-labelledby="logo-castelao-title-es">
  <div class="castelao-hero-image" style="background:#f3f0ea;"><img src="/api/galeria-orixinal?ruta=fotos%2Forixinais%2F373c7089-3234-430a-b035-7eb3b86beb80.jpg" alt="Logotipo histórico de la Sociedad Coral Polifónica de Pontevedra diseñado por Castelao" loading="lazy" /></div>
  <div class="castelao-hero-copy">
    <p class="section-kicker">1925 · Identidad visual</p>
    <h3 id="logo-castelao-title-es">El logotipo de la Polifónica</h3>
    <p>Castelao diseñó también el logotipo de la Sociedad Coral Polifónica de Pontevedra. La figura representa a un músico medieval inspirado en el rey David de la fachada de las Platerías de la Catedral de Santiago de Compostela, una imagen unida desde los primeros años a la identidad de la Sociedad.</p>
    <p>El nombre de la Polifónica aparece con una grafía de inspiración epigráfica, relacionada con las investigaciones de Castelao sobre las inscripciones medievales gallegas y con la tradición gráfica que acabaría siendo reconocida como «letra gallega».</p>
    <a class="pano-source-link" href="https://arde.gal/peza/logotipo-sociedad-coral-polifonica-de-pontevedra" target="_blank" rel="noreferrer">Ver la ficha del logotipo en AR\DE ↗</a>
    <span class="pano-caption">Archivo SCPP · Logo San David.jpg · Fotografía publicada desde R2</span>
  </div>
</section>
<!-- CASTELAO_LOGO_V1_END -->

'''
    },
}

for path, config in FILES.items():
    text = path.read_text(encoding="utf-8")
    if "CASTELAO_LOGO_V1_BEGIN" in text:
        print(f"OK | {path} | bloque xa presente")
        continue

    needle = config["needle"]
    pos = text.find(needle)
    if pos < 0:
        raise SystemExit(f"Non se atopou o punto de inserción en {path}: {needle}")

    text = text[:pos] + config["block"] + text[pos:]
    path.write_text(text, encoding="utf-8")
    print(f"OK | {path} | bloque inserido")
