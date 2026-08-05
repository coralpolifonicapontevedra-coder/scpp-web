# Auditoría global de archivos

La acción `Auditar sistema de archivos` realiza un inventario de solo lectura de los archivos que utiliza la plataforma.

## Alcance

- carpetas de Drive de Documentación, Actas, conciertos, perfiles, personas, repertorio, partituras y fotografías;
- objetos existentes en el bucket R2 privado configurado para las migraciones;
- recursos binarios incluidos en `public/`;
- código heredado que todavía transporta Base64, abre Drive directamente o sincroniza medios mediante commits.

## Clasificación inicial

| Grupo | Decisión inicial |
|---|---|
| Documentación y Actas | Migrar a R2 privado. |
| Programas de mano | Migrar a R2 privado. |
| Fotos de perfil | Migrar a R2 privado manteniendo Drive como entrada y respaldo. |
| Carteles e imágenes de conciertos | Evaluar R2 público y retirar la sincronización a GitHub sólo después de validar el nuevo flujo. |
| Repertorio, partituras, fichas y fotografías | Verificar el sistema ya migrado. |
| Imágenes históricas y documentos editoriales estables | Mantener en Cloudflare Pages salvo que se vuelvan dinámicos. |

## Seguridad

La auditoría no escribe en Drive, Sheets o R2. No descarga el contenido de los archivos y no expone credenciales. Los nombres detallados permanecen en los artefactos privados de GitHub Actions; el resumen muestra únicamente cantidades y tamaños.

Después del primer informe se crearán migraciones separadas por módulo. Todas deberán comenzar en modo `plan`, usar claves deterministas, rechazar sobrescrituras con contenido distinto y conservar Drive como respaldo hasta completar la verificación funcional.
