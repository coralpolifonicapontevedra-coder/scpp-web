# Framework SCPP

Documento técnico vivo da plataforma dixital da Sociedade Coral Polifónica de Pontevedra.

## Obxectivo

Reducir improvisacións, evitar que un cambio nun módulo afecte a outro e establecer unha arquitectura común, documentada e reutilizable.

## Documentos

- [Arquitectura xeral](./ARQUITECTURA.md)
- [Arquitectura de rendemento](./ARQUITECTURA-RENDIMIENTO.md)
- [Gestor de arquivos](./GESTOR-DE-ARQUIVOS.md)
- [Convencións](./CONVENCIONS.md)
- [Decisións técnicas](./DECISIONS.md)
- [Folla de ruta](./ROADMAP.md)
- [Apps Script con GitHub e clasp](./APPS-SCRIPT-CICD.md)
- [Concertos en R2](./CONCERTOS-R2.md)
- [Honras concedidas en R2](./HONRAS-R2.md)

## Principios básicos

1. R2 é o repositorio operativo dos ficheiros e índices servidos pola web.
2. Google Sheets conserva datos e metadatos, non binarios nin Base64.
3. Google Drive queda como zona de entrada, traballo e respaldo operativo cando proceda.
4. Ningunha páxina serve ficheiros directamente desde Drive.
5. As páxinas privadas seguen o fluxo: navegador → Worker → Apps Script para permisos e metadatos → R2 para o ficheiro.
6. As páxinas de lectura con índice válido deben ler desde R2/Cloudflare e non depender dunha consulta en tempo real a Google.
7. Cada módulo debe ter límites claros, erros identificables, caché controlada e auditoría.
8. As decisións relevantes deben quedar rexistradas neste directorio.

## Estado inicial

- Administración de Persoas: adaptada ao novo patrón e ficheiros en R2.
- Concertos: ruta oficial consolidada e índices R2 documentados.
- Honras concedidas: módulo público en incorporación con índice independente `indices/honras-v1.json`.
- Documentación e Actas: pendentes de inventario e migración a R2.
- Fotografías: xa usa R2, pendente de integración no xestor común.
- Partituras e audios: pendentes de normalización no xestor común.

## Mantemento

Este documento debe actualizarse cando se modifique a arquitectura, o fluxo de ficheiros, os permisos, os bindings de Cloudflare, a estrutura das Sheets ou as convencións de desenvolvemento.
