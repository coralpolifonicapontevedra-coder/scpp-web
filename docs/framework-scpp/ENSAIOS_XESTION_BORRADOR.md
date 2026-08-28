# Ensaios v2 — xestión operativa con borrador R2

Data: 28/08/2026

## Obxectivo

A xestión dun ensaio non debe executar unha chamada a Apps Script por cada clic. As modificacións de Obras prepáranse en R2 e consolídanse coa Sheet ao premer `Aceptar`.

## Fluxo

1. `Xestionar` le desde o índice R2 compartido de Ensaios.
2. Asistencia, repertorio, obras actuais e programas de concertos precárganse nunha única apertura.
3. `Engadir desde Repertorio` e `Cargar programa do concerto` modifican o borrador R2 (`ensaios/borradores-v1/`).
4. Non se chama Apps Script durante esas operacións de preparación.
5. `Aceptar` executa `finalizar` no borrador: compara co estado da Sheet, aplica só as diferenzas e actualiza de novo R2.
6. As escrituras cara a Apps Script execútanse secuencialmente para non competir polo `ScriptLock`.

## Razón

A implementación anterior lanzaba varias escrituras de obras en paralelo. Como o despachador de Apps Script protexe as accións de escritura con `ScriptLock`, esas chamadas podían competir entre si e terminar en 502. Ademais obrigaban ao usuario a esperar en cada operación.

O borrador R2 xa existía en `functions/api/ensaios-borrador.js`; esta é a arquitectura que debe reutilizar Administración de Ensaios v2.
