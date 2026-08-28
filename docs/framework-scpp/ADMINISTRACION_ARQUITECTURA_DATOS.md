# Arquitectura común de Administración

Data: 28/08/2026

Este documento fixa o patrón que deben seguir os módulos administrativos do portal SCPP para non duplicar permisos, cachés nin fluxos de sincronización.

## 1. Permisos

A identidade e os permisos institucionais resólvense de forma central en `apps-script/permisos-portal.gs` mediante `resolverPermisosPortal_()`.

Na capa Cloudflare, os módulos administrativos reutilizan a caché central:

`persoas/cache/administracion/<sha256-email>.json`

Un módulo funcional non debe crear unha segunda interpretación de cargos ou perfís.

## 2. Lecturas

A apertura dunha pantalla administrativa debe ser R2-first.

Regra:

1. validar sesión Firebase;
2. validar Administración coa caché central;
3. ler o índice R2 compartido do dominio funcional;
4. só se non existe aínda ese índice, consultar Apps Script para sementalo.

Un TTL nunca pode converter unha copia R2 válida en indispoñible. Un fallo puntual de Apps Script non debe tirar a pantalla se existe unha última copia útil en R2.

## 3. Ensaios

Índice compartido principal:

`ensaios/cache-v2/usuarios/<sha256-email>.json`

Este índice xa é utilizado por `functions/api/ensaios.js` e por `functions/api/ensaios-borrador.js`.

Administración de Ensaios debe reutilizar o mesmo índice; non debe manter como fonte independente `ensaios/admin-v2/...`.

A antiga caché `ensaios/admin-v2/...` queda só como fallback temporal de migración e non se usa como arquitectura permanente.

## 4. Concertos

Índice privado compartido:

- produción: `indices/concertos-privado-v1.json`
- preview: `indices/preview/concertos-privado-v1.json`

Ensaios debe consultar directamente este índice para cargar programas de concertos. Non debe copiar os programas a unha caché propia.

## 5. Escrituras

Patrón general:

`SHEET + R2`

A Sheet conserva o dato persistente e R2 mantén a representación de lectura rápida.

Tras unha escritura correcta:

1. escribir en Apps Script / Sheet;
2. actualizar ou rexenerar R2;
3. non borrar previamente a última copia R2 válida;
4. se a rexeneración falla, manter a última copia útil e reintentar posteriormente.

Isto evita que unha escritura correcta deixe a pantalla inutilizable por un fallo posterior de refresco.

## 6. Xestión de Ensaios

A carga de `Xestionar` debe usar o mesmo índice R2 compartido de Ensaios.

As escrituras de asistencia e obras actualizan Sheet e, inmediatamente despois, o mesmo índice R2 compartido.

As operacións múltiples execútanse en lotes limitados para reducir tempos de espera sen saturar Apps Script.

## 7. Principio de estabilidade

A prioridade é que unha pantalla administrativa poida abrir sempre coa última información R2 válida.

Apps Script é necesario para persistencia, sincronización e sementado, pero non debe formar parte do camiño crítico de cada apertura de pantalla.

## 8. Criterio para novos módulos

Antes de crear unha caché, endpoint de permisos ou índice novo, comprobar se xa existe unha capa compartida que resolva ese problema.

O patrón de referencia para novos módulos administrativos é:

`Firebase → permisos centrais → R2 compartido → Sheet+R2`
