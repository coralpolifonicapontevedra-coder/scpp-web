# Migración de medios de conciertos a R2

## Alcance

- Carpeta `Concertos_Files_`: programas, trípticos, prensa y algún cartel heredado.
- Carpeta `Concertos_Images`: carteles e imágenes, incluidos posibles materiales no vinculados.
- La hoja pública `Concertos` se usa únicamente para clasificar referencias; no se modifica.
- Si la hoja indica una carpeta equivocada, se admite la coincidencia por nombre exacto del archivo.
- Los archivos no enlazados cuyo nombre identifica inequívocamente `Cartel`, `Triptico` o `Prensa` se conservan como material público; esto cubre carteles compartidos por varios conciertos.
- Las claves R2 usan la huella MD5 del contenido. Varias copias idénticas comparten un solo objeto, pero todas sus referencias quedan registradas en el informe.
- Los originales reconocidos por nombre pero no enlazados se guardan bajo `concertos/orixinais/objetos/`; no se ofrecen automáticamente en la página pública.

## Clasificación

- `Cartel` referenciado: `concertos/imaxes/{files|images}/...`, servicio público.
- `Triptico` o `Prensa` referenciado: `concertos/documentos/{files|images}/...`, servicio público desde la página de conciertos.
- Sin referencia: `concertos/pendentes/{files|images}/...`, privado hasta revisión manual.

## Garantías

- `plan` no descarga, sube, mueve ni elimina archivos.
- `upload` exige `MIGRAR_CONCERTOS`.
- Los objetos existentes solo se aceptan si conservan el mismo ID de Drive y tamaño.
- Cada subida se verifica por tamaño y SHA-256.
- El plan muestra el MD5 de Drive para identificar duplicados sin descargar archivos y señala los PDF mayores de 20 MiB para optimizarlos antes de publicarlos.
- Drive queda intacto como respaldo.

## Servicio en produción

- `/media/concertos/{nome}` expón unicamente os nomes incluídos no índice verificado; non permite percorrer o bucket.
- A axenda pública ofrece carteis, trípticos e prensa desde R2.
- O portal autenticado abre os programas desde R2 e conserva Apps Script/Drive como respaldo.
- As imaxes estáticas de Pages permanecen temporalmente como respaldo dos carteis.
- A cabeceira `X-SCPP-Storage` permite comprobar se respondeu `R2` ou `PAGES-FALLBACK`.
