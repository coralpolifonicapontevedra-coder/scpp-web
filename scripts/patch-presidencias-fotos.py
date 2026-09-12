#!/usr/bin/env python3
from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    if new in text:
        print(f"{path}: a fotografía xa está actualizada")
        return
    if old not in text:
        raise SystemExit(f"{path}: non se atopou o bloque esperado de Vicente Riestra; non se modifica")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")
    print(f"{path}: fotografía de Vicente Riestra actualizada")


replace_once(
    "src/components/PublicCoralMenu.astro",
    """        'Vicente Riestra Calderón': {
          src: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Riestra%20Calder%C3%B3n%2C%20Enrique%20Peinador%2C%20Valle-Incl%C3%A1n%2C%20Ram%C3%B3n%20Cabanillas%20e%20Victoriano%20Garc%C3%ADa%20Mart%C3%AD.jpg',
          alt: 'Vicente Riestra Calderón nunha fotografía de grupo no Balneario de Mondariz, primeiro pola esquerda',
          credito: 'Wikimedia Commons · dominio público',
          fonte: 'https://commons.wikimedia.org/wiki/File:Riestra_Calder%C3%B3n,_Enrique_Peinador,_Valle-Incl%C3%A1n,_Ram%C3%B3n_Cabanillas_e_Victoriano_Garc%C3%ADa_Mart%C3%AD.jpg'
        },""",
    """        'Vicente Riestra Calderón': {
          src: '/api/galeria-orixinal?ruta=fotos%2Forixinais%2Fpresidencia-vicente-riestra-calderon.jpg',
          alt: 'Fotografía de Vicente Riestra Calderón, presidente da Sociedade Coral Polifónica de Pontevedra',
          credito: 'Arquivo da SCPP · Presidencias'
        },""",
)

replace_once(
    "public/js/historia-paridad-es.js",
    """    {
      nombre: 'Vicente Riestra Calderón',
      periodo: '1947 — 1967',
      texto: 'Presidió la Sociedad durante dos décadas, sosteniendo su continuidad organizativa y la actividad pública de la agrupación.',
      foto: {
        src: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Riestra%20Calder%C3%B3n%2C%20Enrique%20Peinador%2C%20Valle-Incl%C3%A1n%2C%20Ram%C3%B3n%20Cabanillas%20e%20Victoriano%20Garc%C3%ADa%20Mart%C3%AD.jpg',
        alt: 'Vicente Riestra Calderón en una fotografía de grupo en el Balneario de Mondariz, primero por la izquierda',
        credito: 'Wikimedia Commons · dominio público',
        fuente: 'https://commons.wikimedia.org/wiki/File:Riestra_Calder%C3%B3n,_Enrique_Peinador,_Valle-Incl%C3%A1n,_Ram%C3%B3n_Cabanillas_e_Victoriano_Garc%C3%ADa_Mart%C3%AD.jpg'
      }
    },""",
    """    {
      nombre: 'Vicente Riestra Calderón',
      periodo: '1947 — 1967',
      texto: 'Presidió la Sociedad durante dos décadas, sosteniendo su continuidad organizativa y la actividad pública de la agrupación.',
      foto: {
        src: '/api/galeria-orixinal?ruta=fotos%2Forixinais%2Fpresidencia-vicente-riestra-calderon.jpg',
        alt: 'Fotografía de Vicente Riestra Calderón, presidente de la Sociedad Coral Polifónica de Pontevedra',
        credito: 'Archivo de la SCPP · Presidencias'
      }
    },""",
)

print("Fotografía de Vicente Riestra preparada en galego e castelán")
