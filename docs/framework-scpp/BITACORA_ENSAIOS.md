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

Además, `functions/api/ensaios-admin.js` mantiene lógica propia de caché administrativa R2 (`verificarAdministracionR2`) antes de recurrir a Apps Script. Aunque esa caché se usa como optimización y no debería ser la fuente de autoridad, esta duplicación aumenta el riesgo de resultados diferentes.

## Próximo cambio a realizar

1. Hacer que Administración → Ensaios utilice **una única resolución de permisos** basada en el módulo central del Portal.
2. Evitar dos cargas autorizadas independientes para abrir la misma pantalla.
3. No obligar a `listarEnsaiosPortal` a regenerar desde Sheet (`forzar:true`) en cada apertura administrativa salvo cuando sea necesario tras una escritura.
4. Tras crear un ensayo, utilizar el resultado de la escritura / caché regenerada para refrescar la interfaz sin una segunda autorización innecesaria.
5. Mantener R2 como caché, nunca como fuente de verdad del permiso.
6. Comprobar y limpiar los dos ensayos de prueba duplicados una vez que la pantalla de administración vuelva a ser estable.

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
