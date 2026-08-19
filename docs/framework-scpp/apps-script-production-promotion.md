# Promoción segura de Apps Script a produción

Este procedemento evita cambios manuais no editor de Apps Script. GitHub é a fonte de traballo e `clasp` é o mecanismo de publicación.

## Principios

- Non editar `Código.js` manualmente en Apps Script.
- Non facer `clasp push` desde unha carpeta de Preview.
- Antes de cada promoción, obter unha copia actual do proxecto de produción con `clasp pull` nunha carpeta local separada: `apps-script-production`.
- Os scripts preparadores deben buscar un punto de integración coñecido e fallar se a estrutura cambiou.
- A preparación non publica nada: sempre debe haber unha revisión local antes do `clasp push`.

## Administración → Ensaios

1. Traballar nunha rama de release creada desde `main`.
2. A rama debe conter só as pezas do módulo administrativo e non cambios no módulo normal `/portal/ensaios/`.
3. Preparar unha carpeta clasp de produción chamada `apps-script-production` e executar nela `clasp pull` contra o proxecto correcto de produción.
4. Desde a raíz do repositorio executar:

   `node scripts/prepare-apps-script-production.mjs`

5. O preparador:
   - comproba que existe `apps-script-production/Código.js`;
   - comproba o punto seguro do dispatcher existente;
   - engade só `listarEnsaiosAdministracionPortal` e `actualizarEnsaioAdministracionPortal` se aínda non existen;
   - copia `apps-script/ensaios-administracion.gs` como `apps-script-production/ensaios-administracion.js`;
   - non modifica `appsscript.json`;
   - non modifica `ensaios-portal`, asistencias, repertorio, caché nin finalización de ensaio.
6. Revisar os cambios locais antes de publicar.
7. Só se a revisión é correcta, entrar en `apps-script-production` e executar `npx.cmd @google/clasp push --force`.
8. Actualizar a implementación de produción segundo o fluxo habitual do proxecto y comprobar a web.

## Regra para futuras promocións

Para Concertos ou outros módulos administrativos debe reutilizarse este mesmo patrón: rama limpa desde `main`, preparador determinista, carpeta clasp separada de produción, revisión previa e publicación con `clasp`. Non se debe volver a unha edición manual no editor de Apps Script.
