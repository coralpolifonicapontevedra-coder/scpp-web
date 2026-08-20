# Despregue único de Apps Script: Preview e Produción

GitHub é a fonte canónica do código de Apps Script. Preview e Produción executan o mesmo código; só cambia a configuración do entorno.

## Regra non negociable

- Non existe código funcional específico de Preview nin código funcional específico de Produción.
- `apps-script/` é a única fonte canónica dos módulos `.gs`.
- Un cambio funcional faise unha vez en `apps-script/` e esa mesma revisión despregase aos dous proxectos de Apps Script.
- Se un valor cambia entre Preview e Produción (IDs de Sheets, URLs, tokens, buckets, flags ou similares), debe proceder de Script Properties, variables de Cloudflare, secrets ou bindings; nunca dunha bifurcación do código.
- Non editar código manualmente no editor de Apps Script salvo recuperación excepcional documentada.
- Non manter snapshots de Preview e Produción como fontes de desenvolvemento. Os snapshots, se existen, son só evidencia/auditoría histórica.

## Fluxo

1. Desenvolver nunha rama creada desde `main`.
2. Modificar exclusivamente a fonte canónica en `apps-script/` e o código web compartido.
3. Validar que non se introduciron IDs/URLs específicos dun entorno no código.
4. Despregar a mesma revisión de `apps-script/` ao proxecto Apps Script de Preview.
5. Probar o circuito completo en Preview.
6. Fusionar a rama a `main` sen reescribir nin adaptar a lóxica.
7. Despregar exactamente a mesma revisión de `apps-script/` ao proxecto Apps Script de Produción.
8. As diferenzas de destino resólvense exclusivamente mediante a configuración de cada entorno.

## Administración → Concertos

Concertos é o primeiro módulo que debe cumprir estritamente esta arquitectura. A implementación debe ser a mesma en Preview e Produción para ficha, programa, asistentes, cartel, tríptico, índices R2 e lectura desde Portal. Ensaios non se modifica para conseguir esta unificación.

## Criterio de auditoría

Calquera proceso que copie módulos e despois os modifique para crear unha variante de Produción ou Preview incumpre esta norma. Os scripts de despregue poden empaquetar, renomear extensións ou seleccionar credenciais/destinos, pero non alterar a lóxica funcional.
