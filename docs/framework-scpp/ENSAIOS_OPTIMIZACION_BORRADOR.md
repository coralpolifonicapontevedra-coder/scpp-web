# Optimización de Xestionar Ensaios mediante borrador R2

## Obxectivo

Evitar que accións interactivas como engadir unha obra ou cargar o programa dun concerto queden bloqueadas por varias chamadas consecutivas a Apps Script.

## Fluxo

1. Ao abrir `Xestionar`, a interface le a información de asistencia, repertorio e concertos desde os índices R2 compartidos.
2. En paralelo, reinicialízase o borrador do ensaio desde o índice principal R2 para garantir que parte do estado definitivo máis recente.
3. `Engadir desde Repertorio` escribe só no borrador R2.
4. `Cargar programa do concerto` incorpora todos os IDs de repertorio ao borrador R2 nunha única operación.
5. A interface actualízase localmente sen volver consultar Sheet nin Apps Script.
6. `Aceptar` executa `finalizar`: compara borrador co estado definitivo e consolida en Sheet + R2.

## Regra

A interacción do usuario non debe depender dunha chamada Apps Script por obra. Apps Script queda reservado para a consolidación final.

## Seguridade

O borrador debe reinicializarse ao abrir `Xestionar` para evitar que un borrador antigo poida eliminar relacións xa consolidadas.
