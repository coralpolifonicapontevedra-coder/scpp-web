# Migración de medios de conciertos a R2

## Alcance

- Carpeta `Concertos_Files_`: programas, trípticos, prensa y algún cartel heredado.
- Carpeta `Concertos_Images`: carteles e imágenes, incluidos posibles materiales no vinculados.
- La hoja pública `Concertos` se usa únicamente para clasificar referencias; no se modifica.

## Clasificación

- `Cartel` referenciado: `concertos/imaxes/{files|images}/...`, servicio público.
- `Triptico` o `Prensa` referenciado: `concertos/documentos/{files|images}/...`, servicio público desde la página de conciertos.
- Sin referencia: `concertos/pendentes/{files|images}/...`, privado hasta revisión manual.

## Garantías

- `plan` no descarga, sube, mueve ni elimina archivos.
- `upload` exige `MIGRAR_CONCERTOS`.
- Los objetos existentes solo se aceptan si conservan el mismo ID de Drive y tamaño.
- Cada subida se verifica por tamaño y SHA-256.
- Drive queda intacto como respaldo.

