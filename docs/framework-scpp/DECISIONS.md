# Rexistro de decisións técnicas

Este ficheiro conserva as decisións que condicionan a arquitectura. Non substitúe o historial de Git: explica o motivo e as consecuencias.

## ADR-001 · R2 como repositorio operativo de ficheiros

- **Data:** 2026-08-03
- **Estado:** aceptada

### Contexto

A web utilizaba fluxos distintos: descargas directas ou indirectas desde Drive, conversións Base64, URLs públicas e accesos desde R2. Isto provocaba diferenzas de permisos, tempos de espera e mantemento.

### Decisión

Todo ficheiro servido pola web debe saír de Cloudflare R2. Drive queda como zona de entrada, traballo e respaldo operativo cando corresponda.

### Consecuencias

- Debe existir unha clave R2 rexistrada nos metadatos.
- Apps Script non transportará binarios.
- Os ficheiros privados serán entregados por Workers tras validar permisos.

## ADR-002 · Separación entre datos e ficheiros

- **Data:** 2026-08-03
- **Estado:** aceptada

Google Sheets almacena datos e metadatos. Non se gardarán ficheiros nin representacións Base64 nas respostas ordinarias do portal.

## ADR-003 · Patrón das páxinas privadas

- **Data:** 2026-08-03
- **Estado:** aceptada

Fluxo de referencia:

```text
Páxina Astro → Worker → Apps Script → Sheets
                         ↘ R2 mediante o Worker
```

Apps Script valida permisos e devolve metadatos ou claves. O Worker accede a R2.

## ADR-004 · Migracións seguras e idempotentes

- **Data:** 2026-08-03
- **Estado:** aceptada

Toda migración comeza en modo `plan`. As operacións de subida, verificación e sincronización deben poder repetirse sen duplicar ou corromper datos.

## ADR-005 · IDs estables

- **Data:** 2026-08-03
- **Estado:** aceptada

As relacións, claves R2 e endpoints utilizarán IDs funcionais estables. O número de fila e o antigo `Row ID` só se admitirán temporalmente durante migracións controladas.

## ADR-006 · Páxinas temporais de substitución

- **Data:** 2026-08-03
- **Estado:** aceptada

As rutas `novo`, `nova` ou `v2` poden utilizarse durante probas illadas. Cando a versión estea validada, substituirá a ruta oficial e a temporal será retirada ou redirixida.

## ADR-007 · Caché controlada

- **Data:** 2026-08-03
- **Estado:** aceptada

Os listados poderán usar caché privada por usuario, con tempo fresco coñecido e respaldo limitado. Os ficheiros privados non se almacenarán en cachés públicas.

## ADR-008 · Documento técnico vivo

- **Data:** 2026-08-03
- **Estado:** aceptada

A arquitectura, as convencións e as decisións relevantes manteranse en `docs/framework-scpp/`. Un cambio estrutural non se considera pechado ata actualizar a documentación correspondente.
