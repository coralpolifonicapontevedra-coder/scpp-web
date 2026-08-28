# Bitácora de trabajo — Ensaios

> Documento vivo para dejar constancia de decisiones, cambios, pruebas y pendientes del módulo de Ensaios. Debe actualizarse cada vez que se toque el módulo o sus permisos.

## Objetivo funcional

Centralizar toda la administración de ensayos en `Portal → Administración → Ensaios` y dejar `Portal → Ensaios` para el uso normal de los coralistas.

El módulo administrativo debe cubrir:

- alta de ensayos;
- gestión de fecha y baja;
- eliminación definitiva;
- obras a ensayar;
- carga de repertorio desde un programa de concierto;
- control de asistencia;
- análisis de asistencias;
- finalización del ensayo.

Después de estabilizar esta base, el siguiente bloque funcional será `Ensaios → Obra`, con partitura, audios por voz y sincronización audio ↔ página de partitura.

## Arquitectura de permisos acordada

Existe un resolvedor central de permisos en:

- `apps-script/permisos-portal.gs`
- función principal: `resolverPermisosPortal_(email)`

La fuente de verdad de permisos es la gobernanza (`XuntaDirectiva` / `DireccionArtistica`) y los perfiles (`ADMINISTRACION`, `DIRECCION_ARTISTICA`, `LECTURA`).

**Regla de arquitectura:** los módulos nuevos no deben inventar comprobaciones de permisos propias ni depender exclusivamente de una caché R2. Ensaios debe reutilizar el resolvedor central del Portal para decidir autorización y escritura.

Actualmente `apps-script/ensaios-portal.gs` ya encapsula esta llamada mediante `permisoEnsaiosPortal_()`, y `apps-script/ensaios-administracion.gs` reutiliza a su vez ese permiso. El objetivo es eliminar cualquier capa paralela que pueda producir un 403 contradictorio.

## Cambios realizados hasta ahora

### Administración → Ensaios

Se creó/unificó la pantalla:

- `src/pages/portal/administracion/ensaios.astro`

Incluye:

- botón `+ Novo ensaio`;
- listado y filtros;
- cambiar fecha;
- dar de baja;
- eliminar definitivamente con confirmación `ELIMINAR`;
- gestión de obras;
- asistentes;
- análisis de asistencia;
- finalización del ensayo;
- adaptación móvil de formularios y diálogos.

### Eliminación

La eliminación definitiva conserva una separación clara respecto de “Dar de baixa”:

- baja = reversible/conserva relaciones;
- eliminar = borra ensayo y relaciones asociadas de obras/asistencias.

### Permisos / middleware

Se retiró la segunda barrera genérica del middleware para Ensaios. `functions/api/_middleware.js` ya deja que los endpoints de Ensaios validen identidad y que Apps Script resuelva los permisos centrales.

### Apps Script preview

Workspace local:

- `apps-script-preview/`
- está ignorado por Git y vinculado al proyecto Apps Script de pruebas.

El deployment web de preview fue actualizado manteniendo la misma URL y pasó de `@30` a:

- **@31 — “Ensaios - permisos e alta actualizados - Preview”**

Se comprobó que el código local del workspace estaba `up to date` antes del despliegue.

## Prueba del 28/08/2026

Resultado observado:

1. El formulario de `Novo ensaio` llegó a abrir correctamente.
2. La operación de alta **sí escribió en la Sheet de preview**.
3. La Sheet `SCPP PREVIEW - Ensaios` contiene dos altas de prueba equivalentes para el 30/08/2026, por lo que la escritura se ejecutó más de una vez durante las pruebas.
4. Después de la escritura, la pantalla no mostró el ensayo nuevo.
5. Al recargar, `Administración → Ensaios` volvió a mostrar:
   - `Non foi posible abrir a administración de ensaios`
   - `Non autorizado`
   - nivel de acceso atascado en `Comprobando…`

**Conclusión:** el problema actual ya no es el alta. La escritura funciona. El fallo está en la recarga/listado posterior y en una autorización contradictoria de alguna de las lecturas.

## Punto técnico actual

La pantalla administrativa ejecuta `loadAll()` y lanza en paralelo:

- `adminApi('listar')` → `/api/ensaios-admin`
- `rehearsalApi('listarEnsaiosPortal', { forzar:true })` → `/api/ensaios`

El uso de `Promise.all()` provoca que, si cualquiera de las dos rutas devuelve `Non autorizado`, falle toda la página aunque la otra lectura sea válida.

Además, `functions/api/ensaios-admin.js` mantenía lógica propia de caché administrativa R2 (`verificarAdministracionR2`) antes de recurrir a Apps Script. Aunque esa caché se usaba como optimización y no debía ser la fuente de autoridad, esta duplicación aumentaba el riesgo de resultados diferentes.

## Intervención 28/08/2026 — unificación de permisos administrativos

Archivo modificado:

- `functions/api/ensaios-admin.js`

Cambio aplicado:

1. Se elimina la comprobación paralela `verificarAdministracionR2` y la dependencia de `persoas/cache/administracion/` para decidir si se puede administrar Ensaios.
2. Si existe el caché R2 de Ensaios, solo se acepta para Administración cuando el propio payload contiene `perfil.podeEditar === true`. Ese valor procede de `resolverPermisosPortal_()` a través de `listarEnsaiosPortal`.
3. Si no existe caché válida, `/api/ensaios-admin` llama a `listarEnsaiosPortal`, no a `listarEnsaiosAdministracionPortal`, y vuelve a comprobar `perfil.podeEditar`.
4. Las acciones `cambiarData` y `darBaixa` siguen pasando por Apps Script, donde `ensaios-administracion.gs` reutiliza `permisoEnsaiosPortal_()` y, por tanto, el resolvedor central.
5. R2 queda expresamente como caché y nunca como fuente autónoma de autorización.

Objetivo de esta intervención: eliminar el `Non autorizado` contradictorio al recargar Administración → Ensaios y hacer que el listado administrativo use la misma decisión de permisos que el resto del Portal.

Pendiente inmediato tras desplegar el PR: recargar `Administración → Ensaios` sin crear nada nuevo y comprobar que aparecen los ensayos de preview. Si abre correctamente, limpiar los dos ensayos de prueba duplicados y continuar con el flujo crear → ver → cambiar fecha → eliminar.

## Próximo cambio a realizar

1. Verificar el resultado de la unificación de permisos en preview.
2. Si la pantalla abre estable, simplificar después `loadAll()` para no realizar dos lecturas paralelas de Ensaios ni usar `forzar:true` en cada apertura.
3. Tras crear un ensayo, utilizar el resultado de la escritura / caché regenerada para refrescar la interfaz sin una segunda autorización innecesaria.
4. Mantener R2 como caché, nunca como fuente de verdad del permiso.
5. Limpiar los dos ensayos de prueba duplicados una vez que la pantalla de administración vuelva a ser estable.

## Criterio de aceptación antes de seguir con el ensayo por obra

No se continuará con partitura + audio por voz hasta que en preview se verifiquen, en una misma sesión y sin errores intermedios:

- abrir Administración → Ensaios;
- crear un ensayo;
- verlo inmediatamente en la lista;
- recargar la página y seguir viéndolo;
- cambiar su fecha;
- darlo de baja/reactivar si corresponde;
- eliminarlo definitivamente;
- comprobar que no quedan relaciones huérfanas;
- funcionamiento correcto en escritorio y móvil.

## Norma para próximas intervenciones

Cada cambio relevante de este módulo debe añadirse a esta bitácora indicando:

- fecha;
- archivos tocados;
- motivo;
- resultado de prueba;
- deployment/PR si lo hay;
- pendiente inmediato.

Así el estado del módulo puede reconstruirse desde el repositorio sin depender del historial de conversación.
