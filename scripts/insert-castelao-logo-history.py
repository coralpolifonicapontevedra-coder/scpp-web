from pathlib import Path
import re

BLOCKS = {
    Path("src/pages/historia.astro"): r'''        <section class="castelao-emblem-note" aria-labelledby="san-david-emblema-title">
          <div class="castelao-emblem-visuals">
            <img
              class="castelao-emblem-main"
              src="/api/galeria-orixinal?ruta=fotos%2Forixinais%2F373c7089-3234-430a-b035-7eb3b86beb80.jpg"
              alt="Logotipo histórico da Sociedade Coral Polifónica de Pontevedra deseñado por Castelao"
              loading="lazy"
            />
            <figure class="castelao-emblem-history">
              <img
                src="/api/galeria-orixinal?ruta=fotos%2Forixinais%2F3ee29336-fc4d-4a1f-97a9-e1575291494c.png"
                alt="Versión histórica do logotipo de San David coa sinatura de Castelao"
                loading="lazy"
              />
              <figcaption>Versión histórica coa sinatura de Castelao · Arquivo SCPP</figcaption>
            </figure>
          </div>
          <div>
            <p class="section-kicker">1925 · Identidade visual</p>
            <h3 id="san-david-emblema-title">O logotipo da Polifónica, deseñado por Castelao</h3>
            <p>
              O logotipo da Sociedade Coral Polifónica de Pontevedra foi deseñado por Alfonso Daniel
              Rodríguez Castelao e representa un músico medieval inspirado na figura do rei David da
              fachada das Praterías da Catedral de Santiago de Compostela. O mesmo motivo preside o
              pano de boca de San David, empregado desde os primeiros concertos da agrupación en 1926.
            </p>
            <p>
              A inscrición que envolve a figura utiliza unha grafía de trazo manual e inspiración
              epigráfica, ligada ás investigacións de Castelao sobre as inscricións medievais galegas e
              á tradición gráfica coñecida como «letra galega».
            </p>
            <a class="pano-source-link" href="https://arde.gal/peza/logotipo-sociedad-coral-polifonica-de-pontevedra" target="_blank" rel="noreferrer">
              Ver a ficha do logotipo en AR\DE ↗
            </a>
            <p class="castelao-emblem-source">Arquivo SCPP · Orixinais da carpeta «Panos castelao» · Publicados desde R2</p>
          </div>
        </section>''',
    Path("src/pages/es/historia.astro"): r'''<section class="castelao-emblem-note" aria-labelledby="san-david-emblema-title-es"><div class="castelao-emblem-visuals">
          <img class="castelao-emblem-main" src="/api/galeria-orixinal?ruta=fotos%2Forixinais%2F373c7089-3234-430a-b035-7eb3b86beb80.jpg" alt="Logotipo histórico de la Sociedad Coral Polifónica de Pontevedra diseñado por Castelao" loading="lazy" />
          <figure class="castelao-emblem-history"><img src="/api/galeria-orixinal?ruta=fotos%2Forixinais%2F3ee29336-fc4d-4a1f-97a9-e1575291494c.png" alt="Versión histórica del logotipo de San David con la firma de Castelao" loading="lazy" /><figcaption>Versión histórica con la firma de Castelao · Archivo SCPP</figcaption></figure>
        </div><div><p class="section-kicker">1925 · Identidad visual</p><h3 id="san-david-emblema-title-es">El logotipo de la Polifónica, diseñado por Castelao</h3><p>El logotipo de la Sociedad Coral Polifónica de Pontevedra fue diseñado por Alfonso Daniel Rodríguez Castelao y representa a un músico medieval inspirado en la figura del rey David de la fachada de las Platerías de la Catedral de Santiago de Compostela. El mismo motivo preside el telón de boca de San David, utilizado desde los primeros conciertos de la agrupación en 1926.</p><p>La inscripción que rodea la figura utiliza una grafía de trazo manual e inspiración epigráfica, vinculada a las investigaciones de Castelao sobre las inscripciones medievales gallegas y a la tradición gráfica conocida como «letra gallega».</p><a class="pano-source-link" href="https://arde.gal/peza/logotipo-sociedad-coral-polifonica-de-pontevedra" target="_blank" rel="noreferrer">Ver la ficha del logotipo en AR\DE ↗</a><p class="castelao-emblem-source">Archivo SCPP · Originales de la carpeta «Panos castelao» · Publicados desde R2</p></div></section>''',
}

PATTERNS = {
    Path("src/pages/historia.astro"): r'<section class="castelao-emblem-note" aria-labelledby="san-david-emblema-title">.*?</section>',
    Path("src/pages/es/historia.astro"): r'<section class="castelao-emblem-note" aria-labelledby="san-david-emblema-title-es">.*?</section>',
}

for path, block in BLOCKS.items():
    text = path.read_text(encoding="utf-8")
    text, count = re.subn(PATTERNS[path], block, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"Non se atopou exactamente un bloque do logotipo en {path}: {count}")
    path.write_text(text, encoding="utf-8")
    print(f"OK | {path} | bloque do logotipo actualizado")
