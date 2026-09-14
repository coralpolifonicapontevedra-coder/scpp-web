# Corrección de permisos del portal — 14/09/2026

Estado: implementada localmente en `codex/permisos-audit-fix-20260913`, sobre `81a59f4`. No publicada.

## Cambios

- Galería privada, partituras y repertorio comprueban alta activa y permisos de módulo antes de entregar datos o archivos. Se conserva la lectura ordinaria de miembros activos sin excepción individual; un permiso explícito de denegación prevalece.
- La administración de fotografías pasa por un control adicional antes de los accesos rápidos a R2. Las escrituras consultan la autorización vigente.
- Las decisiones de lectura se reutilizan durante un máximo absoluto de 60 segundos. Las invalidaciones de permisos eliminan también estas decisiones y las autorizaciones históricas de fotografías. Una consulta concurrente puede reintroducir una decisión anterior, pero no prolongar ese plazo.
- Documentación consulta siempre la lista autorizada actual antes de entregar un archivo. Una lista vacía o una denegación nunca recupera una lista antigua. Las respuestas de archivos usan `private, no-store`.
- Las asistencias dejan de compartir una caché independiente de la identidad del usuario.
- Si se guarda un permiso pero falla su invalidación, la API informa de ambas circunstancias expresamente.

## Compatibilidad con producción

Se obtuvo en un directorio separado el Apps Script desplegado en la versión 117 y se comparó con la copia del repositorio. Los módulos de permisos, documentación y sincronización coinciden. Las diferencias del dispatcher y del archivo principal incluyen otras funciones de repertorio, ensayos, donaciones, registros y bloqueo de fotografías; el módulo de fotografías publicado conserva una verificación adicional de escritura en Sheets. Estas diferencias no forman parte de la corrección y no se sustituyen.

Las acciones utilizadas por el nuevo control existen en la versión 117: `comprobarAceptacion` rechaza cuentas inactivas; `obterPermisosUsuarioPortal` devuelve permisos explícitos; `comprobarFotosAdministracionPortal` conserva la comprobación del perfil de administración. No se modifica Apps Script.

## Validación y alcance

182 pruebas automatizadas superadas, incluidas 29 de ejecución sobre autorización, cachés, denegaciones, fallos del servicio y aislamiento de asistencias. Comprobación TypeScript y lint ejecutadas. La compilación se registra en `audit-20260913/permissions-build.log`, fuera del repositorio.

Las pruebas utilizan identidades y servicios simulados. Sigue pendiente la comprobación autenticada en el entorno de despliegue con cuentas reales de administración y coralista. No se han retirado permisos a ninguna cuenta real.

La primera lectura tras caducar la autorización requiere consultas a Apps Script; si no puede verificarse, el servidor deniega temporalmente el acceso. Los controles no pueden retirar archivos ya descargados. Otras cachés del helper común tienen un plazo de cinco minutos; este cambio no certifica todos los módulos del portal.

Para publicar debe revisarse de nuevo el estado remoto y el diff efectivo. La corrección no incluye los PDF ni los recursos de terceros generados durante la compilación. La reversión consiste en revertir exclusivamente el commit de esta corrección y volver a desplegar la versión anterior; no requiere migraciones ni cambios en Sheets.
