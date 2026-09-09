# Reconciliación Apps Script — 2026-08-19

## Obxectivo

Este documento parte de dúas fotografías reais obtidas con `clasp clone` o 19/08/2026 e gardadas en:

- `apps-script/snapshot-2026-08-19/preview/`
- `apps-script/snapshot-2026-08-19/production/`

O obxectivo non é manter dous códigos independentes, senón converxer cara a un único código canónico en GitHub que poida despregarse primeiro a Preview e despois a Producción. As diferenzas de ambiente deben residir nas Propiedades do script, no `Script ID` local de `clasp` e nos deployments, non en copias funcionais diverxentes do código.

## Estado executivo actual

**Estado: PAUSADO DE FORMA INTENCIONADA, SEN DESPREGAMENTOS.**

Esta reconciliación queda parada antes de crear `apps-script/current/` porque existe traballo funcional simultáneo na rama `agent/administracion-ensaios` sobre Administración → Ensaios (incluíndo operacións como baixa/eliminación e cambio de data). Esa rama pode modificar ficheiros de Apps Script que tamén forman parte desta reconciliación.

Non se debe crear nin despregar o código canónico definitivo ata incorporar primeiro os cambios funcionais aprobados desa rama.

A PR de infraestrutura é a **#61**, mantida en borrador durante esta fase.

## Traballo realizado o 19/08/2026

1. Instalouse e verificouse `clasp` no ordenador de traballo.
2. Obtívose unha copia real independente dos dous proxectos de Apps Script mediante `clasp clone`:
   - `AppsScript-Preview` → SCPP Script - Pruebas.
   - `AppsScript-Produccion` → proxecto de produción.
3. Verificouse `clasp status` en Preview: 20 ficheiros rastrexados e `.clasp.json` local/non rastrexado.
4. Verificáronse os deployments existentes:
   - Preview: 2 deployments no momento da comprobación.
   - Producción: 12 deployments no momento da comprobación.
5. Executouse accidentalmente `clasp push` en ambos proxectos despois dos clones. Ao partir de copias acabadas de clonar, o código local correspondía ao código remoto de cada proxecto. Non se crearon deployments novos con esa operación. Posteriormente verificáronse `status` e `deployments`.
6. Gardáronse en GitHub snapshots completos de ambos proxectos, excluíndo `.clasp.json`.
7. Creouse a rama `agent/apps-script-sync-architecture` e a PR #61 en borrador para illar este traballo do desenvolvemento funcional.
8. Comparáronse Preview e Producción e identificouse que a deriva principal procede de configuración incrustada en Producción fronte a configuración externalizada en Preview.
9. Decidiuse que GitHub debe ser a fonte de verdade e que o destino final será un único `apps-script/current/`, non dúas copias independentes.
10. Antes de construír `current/`, decidiuse pausar para non interferir coa rama funcional `agent/administracion-ensaios`.

## Resultado estrutural dos snapshots

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

### Outros ficheiros xa inspeccionados

A revisión adicional de `diagnostico-administrador-fotos.js`, `permisos-fotos-drive.js`, `probas-aceptacion-acceso.js`, `publicacions-web.js` e `solicitudes-web.js` reforza o mesmo patrón: Preview substitúe correos, IDs de carpetas/Sheets e datos de proba incrustados por Script Properties. Non se debe, con todo, asumir que todo Preview substitúe automaticamente a Producción: calquera helper ou funcionalidade exclusiva de Producción debe preservarse tras comparación.

## Ficheiros idénticos que poden considerarse xa comúns

```text
appsscript.json
ensaios-eliminar-ensaio.js
r2-fotos-portal.js
sincronizacion-medios-concertos.js
```

## Ficheiros que requiren reconciliación antes de `current/`

Os 15 ficheiros diverxentes deben revisarse contra o estado funcional definitivo. A revisión xa realizada permite usar Preview como **base técnica preferente** pola parametrización, pero non autoriza unha copia cega de Preview sobre Producción.

Especial atención a:

```text
Código.js
ensaios-portal.js
aceptacion-portal.js
fotos-portal.js
perfil-portal.js
persoas-administracion.js
```

Os dous primeiros deben volver compararse despois de pechar `agent/administracion-ensaios`.

## Arquitectura obxectivo

```text
apps-script/
├── current/                 # única fonte canónica despregable (AÍNDA NON CREADA)
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
rama funcional GitHub
  → revisión e aprobación
  → integración na fonte canónica
  → apps-script/current
  → sincronizar current a AppsScript-Preview
  → clasp status
  → clasp push
  → probar Preview
  → aprobación
  → sincronizar O MESMO COMMIT a AppsScript-Produccion
  → clasp status
  → clasp push
  → actualizar deployment de Producción cando corresponda
```

A regra principal é: **o código enviado aos dous proxectos debe ser o mesmo commit de GitHub**. O ambiente determínase polas Propiedades do script, non por bifurcacións manuais do código.

## Plan para retomar este traballo

Cando remate o traballo de Administración → Ensaios:

1. Confirmar que `agent/administracion-ensaios` está no estado funcional aprobado.
2. Comparar esa rama coa rama de arquitectura e identificar cambios en Apps Script, especialmente `Código.js`, `ensaios-portal.js` e módulos relacionados.
3. Incorporar os cambios funcionais aprobados á reconciliación; non sobrescribilos cos snapshots do 19/08.
4. Completar a revisión dos ficheiros diverxentes.
5. Construír `apps-script/current/` tomando Preview como base técnica parametrizada e preservando toda funcionalidade válida de Producción e da rama de Ensaios.
6. Eliminar IDs, correos e segredos incrustados do código canónico.
7. Incorporar `configuracion-entorno.js` ao código canónico para ambos ambientes; en Producción `SCPP_ENVIRONMENT=production`.
8. Validar todas as Script Properties necesarias en Preview antes de calquera push.
9. Facer a primeira proba unicamente contra Preview.
10. Só despois de validar Preview, preparar a promoción exacta do mesmo commit a Producción.

## Regra de seguridade durante a pausa e reconciliación

Ata completar `apps-script/current/`:

- **non facer `clasp push` como parte deste traballo**;
- non igualar Preview e Producción por copia directa;
- non editar Apps Script manualmente salvo emerxencia;
- se outro traballo modifica Apps Script, debe integrarse primeiro en GitHub;
- se hai unha edición remota inevitable, facer `clasp pull`, gardar snapshot e reconciliar antes de continuar;
- os snapshots nunca son a fonte de despregamento ordinario;
- non mesturar a rama `agent/apps-script-sync-architecture` coa rama funcional `agent/administracion-ensaios` ata que esta última estea aprobada.

## Punto exacto de reanudación

A seguinte acción desta liña de traballo **non é facer push nin crear `current/` inmediatamente**. É comparar a versión final aprobada de `agent/administracion-ensaios` cos snapshots e coa rama de arquitectura. Só despois desa comparación se constrúe o código canónico.
