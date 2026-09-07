#!/usr/bin/env python3
from pathlib import Path

path = Path("src/components/PublicCoralMenu.astro")
text = path.read_text(encoding="utf-8")

replacements = {
"""        'Augusto García Sánchez': {
          src: '/api/galeria-orixinal?ruta=fotos%2Forixinais%2Fea4d64bf-dd2f-4f10-8fde-b855a8c2b04d.jpg',
          alt: 'A Sociedade Coral Polifónica de Pontevedra dirixida por Agustín Bertomeu en 1975, durante a presidencia de Augusto García Sánchez',
          credito: 'Arquivo SCPP · A Polifónica en 1975'
        },""":
"""        'Augusto García Sánchez': {
          src: '/api/galeria-orixinal?ruta=fotos%2Forixinais%2Fpresidencia-augusto-garcia-sanchez.jpg',
          alt: 'Fotografía de Augusto García Sánchez, presidente da Sociedade Coral Polifónica de Pontevedra',
          credito: 'Arquivo da SCPP · Presidencias'
        },""",
"""        'Xosé Carlos Valle Pérez': {
          src: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Milagros%20Bar%C3%A1%20e%20Xos%C3%A9%20Carlos%20Valle%20P%C3%A9rez.jpg',
          alt: 'Milagros Bará e Xosé Carlos Valle Pérez nunha charla no Museo de Pontevedra en 2011',
          credito: 'Estevoaei / Wikimedia Commons · CC BY-SA 4.0',
          fonte: 'https://commons.wikimedia.org/wiki/File:Milagros_Bar%C3%A1_e_Xos%C3%A9_Carlos_Valle_P%C3%A9rez.jpg'
        },""":
"""        'Xosé Carlos Valle Pérez': {
          src: '/api/galeria-orixinal?ruta=fotos%2Forixinais%2Fpresidencia-xose-carlos-valle-perez.jpg',
          alt: 'Fotografía de Xosé Carlos Valle Pérez, presidente da Sociedade Coral Polifónica de Pontevedra',
          credito: 'Arquivo da SCPP · Presidencias'
        },""",
"""        'José Raposeiras Correa': {
          src: '/api/galeria-orixinal?ruta=fotos%2Forixinais%2F1.jpg',
          alt: 'José Raposeiras Correa nunha recepción da Xunta Directiva da SCPP na Deputación de Pontevedra en 2026',
          credito: 'Prensa Deputación · Deputación Provincial de Pontevedra'
        }""":
"""        'José Raposeiras Correa': {
          src: '/api/galeria-orixinal?ruta=fotos%2Forixinais%2Fpresidencia-jose-raposeiras-correa.jpg',
          alt: 'Fotografía de José Raposeiras Correa, presidente da Sociedade Coral Polifónica de Pontevedra',
          credito: 'Arquivo da SCPP · Presidencias'
        }""",
}

for old, new in replacements.items():
    if old not in text:
        raise SystemExit("Non se atopou un dos bloques de presidencias esperado; non se modifica o ficheiro")
    text = text.replace(old, new, 1)

path.write_text(text, encoding="utf-8")
print("Substituídas exactamente as tres fotografías de Presidencias")
