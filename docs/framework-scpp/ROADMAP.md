# Folla de ruta técnica

## Fase A · Framework SCPP

Estado: en curso.

- [x] Crear o índice do documento técnico vivo.
- [x] Definir a arquitectura xeral.
- [x] Definir o Gestor de Arquivos.
- [x] Crear o rexistro inicial de decisións.
- [x] Establecer convencións.
- [ ] Documentar a estrutura real de bindings e variables de Cloudflare.
- [ ] Documentar o despachador principal de Apps Script.
- [ ] Crear unha táboa de módulos e o seu estado de migración.
- [ ] Engadir procedemento de incidencias, recuperación e rollback.

## Fase B · Gestor de Arquivos

- [ ] Crear `scripts/file-manager/`.
- [ ] Definir configuración declarativa por módulo.
- [ ] Implementar modos `plan`, `upload`, `verify`, `sync` e `audit`.
- [ ] Crear formato de informe CSV común.
- [ ] Engadir idempotencia e detección de conflitos.
- [ ] Crear workflow manual de GitHub Actions.
- [ ] Crear probas co módulo Persoas, sen modificar os datos existentes.

## Fase C · Migración por módulos

### Persoas

- [x] Migrar fichas a R2.
- [x] Rexistrar metadatos na Sheet.
- [x] Servir fichas desde `R2_PRIVADO`.
- [x] Consolidar Administración na ruta oficial.
- [ ] Incorporar Persoas ao motor xenérico como caso de comprobación.

### Documentación

- [ ] Inventario en modo `plan`.
- [ ] Migración de documentos a R2.
- [ ] Actualización das columnas R2.
- [ ] Substitución de Drive/Base64 por clave R2.
- [ ] Auditoría e consolidación.

### Actas

- [ ] Inventario.
- [ ] Migración.
- [ ] Integración no endpoint de Documentación.
- [ ] Auditoría.

### Fotografías

- [ ] Catalogar o fluxo existente de subida e revisión.
- [ ] Integrar no catálogo común sen alterar a interface especializada.
- [ ] Definir orixinal, miniatura, publicación pública e publicación privada.
- [ ] Auditoría de obxectos orfos e referencias rotas.

### Partituras e audios

- [ ] Inventario e normalización de claves.
- [ ] Migración ou rexistro do contido xa existente.
- [ ] Detección de duplicados.
- [ ] Integración co repertorio.

### Concertos

- [x] Consolidar a versión funcional na ruta `/portal/concertos/`.
- [ ] Integrar carteis e programas de man no Gestor de Arquivos.

## Fase D · Auditoría global

- [ ] Informe de todos os módulos.
- [ ] Referencias rotas.
- [ ] Duplicados.
- [ ] Obxectos orfos.
- [ ] Claves non normalizadas.
- [ ] Revisión de permisos e cachés.
- [ ] Proba de recuperación ante caída de Apps Script ou Drive.

## Criterio de finalización dun módulo

Un módulo considérase consolidado cando:

1. Usa IDs estables.
2. Non serve ficheiros desde Drive.
3. Non transporta Base64.
4. Usa R2 e metadatos verificados.
5. Ten caché e tempos máximos coñecidos.
6. Mostra erros identificables.
7. Ten unha única ruta oficial.
8. Está documentado e auditado.
