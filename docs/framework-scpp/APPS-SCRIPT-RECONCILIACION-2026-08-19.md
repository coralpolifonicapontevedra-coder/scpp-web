# Reconciliación Apps Script — 2026-08-19

## Obxectivo

Este documento parte de dúas fotografías reais obtidas con `clasp clone` o 19/08/2026 e gardadas en:

- `apps-script/snapshot-2026-08-19/preview/`
- `apps-script/snapshot-2026-08-19/production/`

O obxectivo non é manter dous códigos independentes, senón converxer cara a un único código canónico en GitHub que poida despregarse primeiro a Preview e despois a Producción. As diferenzas de ambiente deben residir nas Propiedades do script, no `Script ID` local de `clasp` e nos deployments, non en copias funcionais diverxentes do código.

## Resultado estrutural

- Preview: 20 ficheiros.
- Producción: 19 ficheiros.
- Só Preview contén `configuracion-entorno.js`.
- 4 ficheiros son idénticos byte a byte segundo o SHA de GitHub:
  - `appsscript.json`
  - `ensaios-eliminar-ensaio.js`
  - `r2-fotos-portal.js`
  - `sincronizacion-medios-concertos.js`
- 15 ficheiros co mesmo nome teñen contido distinto e deben reconciliarse antes de unificar o despregamento.

## Patrón principal verificado

A comparación manual de módulos representativos confirma que unha parte importante das diferenzas non é funcional, senón de configuración.

### Preview

Preview tende a:

- obter IDs de Sheets e carpetas mediante `obterPropiedadeObrigatoria_()`;
- usar `WEB_TEST_EMAIL` desde Propiedades do script;
- centralizar a separación de ambiente en `configuracion-entorno.js`;
- validar `SCPP_ENVIRONMENT`;
- bloquear escrituras con `SCPP_ALLOW_WRITES`;
- evitar IDs, correos e segredos incrustados no código;
- eliminar algunhas duplicacións de helpers que aínda existen en Producción.

### Producción actual

Producción conserva en varios módulos:

- IDs de Sheets e carpetas escritos directamente no código;
- funcións de configuración que escriben eses IDs en Script Properties;
- identificadores de folla por `sheetId` nalgúns módulos;
- correos de proba incrustados nalgúns puntos;
- helpers duplicados que Preview xa resolveu apoiándose no dispatcher/código común.

## Casos revisados

### `Código.js`

Diferenza estrutural importante.

Preview introduce a validación de ambiente e de escrituras, substitúe múltiples IDs incrustados por Propiedades obrigatorias e elimina bloques duplicados que xa viven en módulos específicos. Non debe copiarse literalmente sobre Producción ata completar a reconciliación do dispatcher e dos helpers globais.

Clasificación: **configuración de ambiente + limpeza estrutural + posible desfase funcional**.

### `ensaios-portal.js`

A lóxica funcional observada mantense, pero Preview elimina o fallback con IDs fixos e esixe explicitamente:

- `ENSAIOS_SPREADSHEET_ID`
- `ASISTENCIAS_ENSAIOS_SPREADSHEET_ID`
- `ENSAIOS_REPERTORIO_SPREADSHEET_ID`
- `PERSOAS_SPREADSHEET_ID`
- `CONCERTOS_SPREADSHEET_ID`
- `REPERTORIO_SPREADSHEET_ID`

Clasificación: **diferenza de configuración de ambiente**.

### `asistencias-concertos-portal.js`

A lóxica é equivalente. Preview substitúe o ID fixo da Sheet por `ASISTENCIAS_CONCERTOS_SPREADSHEET_ID`.

Clasificación: **diferenza de configuración de ambiente**.

### `concertos-portal.js`

A lóxica de acceso ao documento é esencialmente a mesma. Preview elimina a función que grava IDs fixos e pasa a resolver Sheets e carpetas mediante Propiedades obrigatorias. Tamén usa nomes de folla en lugar de depender de IDs internos de pestana.

Clasificación: **diferenza de configuración de ambiente con simplificación estrutural**.

### `documentacion-portal.js`

Producción mantén varios IDs de Spreadsheet, sheetId e carpetas directamente en `DOC_PORTAL_CONFIG`, e unha conta de proba fixa. Preview conserva a lóxica pero externaliza esas referencias a Propiedades do script.

Clasificación: **diferenza de configuración de ambiente**.

### `aceptacion-portal.js`

Preview reutiliza `obterFollaUsuariosWeb_()` e xa non duplica `obterUsuarioWebPorEmail()`. Producción conserva unha implementación local adicional.

Clasificación: **limpeza estrutural / eliminación de duplicación**, non unha diferenza que deba sobrevivir entre ambientes.

## Ficheiros idénticos que poden considerarse xa comúns

Os seguintes ficheiros teñen exactamente o mesmo SHA en ambos snapshots e son candidatos inmediatos a formar parte do código canónico común:

```text
appsscript.json
ensaios-eliminar-ensaio.js
r2-fotos-portal.js
sincronizacion-medios-concertos.js
```

## Ficheiros diverxentes pendentes de revisión detallada

Ademais dos xa revisados, quedan por reconciliar de forma específica:

```text
diagnostico-administrador-fotos.js
diagnostico.js
fotos-portal.js
perfil-portal.js
permisos-fotos-drive.js
persoas-administracion.js
probas-aceptacion-acceso.js
publicacions-web.js
solicitudes-web.js
```

Non deben etiquetarse automaticamente como “só ambiente” ata revisar o diff funcional.

## Arquitectura obxectivo

A estrutura final non debe ser `common/preview/production` con tres copias do código, porque volvería permitir deriva entre ambientes.

A proposta é:

```text
apps-script/
├── current/                 # única fonte canónica despregable
├── snapshot-2026-08-19/     # evidencia da auditoría; non despregable
│   ├── preview/
│   └── production/
└── canonical-2026-08-03/    # snapshot histórico anterior
```

`apps-script/current/` deberá conter exactamente o mesmo código para Preview e Producción.

As diferenzas quedan fóra do código:

```text
Preview
  .clasp.json local → Script ID de SCPP Script - Pruebas
  Script Properties → valores de test
  deployments → Preview

Producción
  .clasp.json local → Script ID de Producción
  Script Properties → valores de producción
  deployments → Producción
```

`.clasp.json` non forma parte de `current/` nin debe copiarse entre ambientes.

## Fluxo final desexado

```text
rama GitHub
  → revisión
  → apps-script/current
  → copiar/sincronizar current a AppsScript-Preview
  → clasp status
  → clasp push
  → probar Preview
  → aprobación
  → copiar/sincronizar o MESMO current a AppsScript-Produccion
  → clasp status
  → clasp push
  → actualizar deployment de Producción cando corresponda
```

A regra principal é: **o código enviado aos dous proxectos debe ser o mesmo commit de GitHub**. O ambiente determínase polas Propiedades do script, non por bifurcacións manuais do código.

## Plan de migración

1. Conservar intactos os snapshots do 19/08/2026.
2. Revisar os 9 ficheiros diverxentes aínda non clasificados.
3. Construír `apps-script/current/` tomando como base a variante máis segura e parametrizada, preservando toda funcionalidade válida de Producción.
4. Eliminar IDs, correos e segredos incrustados do código canónico.
5. Incorporar `configuracion-entorno.js` ao código canónico para ambos ambientes; en Producción `SCPP_ENVIRONMENT=production`.
6. Validar que Producción ten todas as Script Properties necesarias antes de despregar o código canónico.
7. Facer unha primeira proba inocua contra Preview.
8. Só tras validar Preview, probar a promoción exacta do mesmo commit a Producción.
9. Automatizar parcialmente o fluxo só cando a reconciliación estea pechada e exista unha comprobación previa de destino.

## Regra de seguridade durante a reconciliación

Ata completar `apps-script/current/`:

- non facer `clasp push` desde unha copia preparada para o outro ambiente;
- non igualar Preview e Producción por copia directa;
- non editar Apps Script manualmente salvo emerxencia;
- se hai unha edición remota, facer `clasp pull`, gardar snapshot e reconciliar antes de continuar;
- os snapshots nunca son a fonte de despregamento ordinario.
