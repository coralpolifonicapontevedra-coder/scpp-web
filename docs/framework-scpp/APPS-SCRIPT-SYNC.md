# Fluxo fiable GitHub ↔ Apps Script

> Estado verificado: 2026-08-19.
>
> Obxectivo: establecer un procedemento repetible no que GitHub sexa a fonte de verdade do código de Apps Script, Preview sexa o primeiro destino de proba e Producción só reciba cambios xa validados.

## 1. Principio operativo

O código non debe evolucionar manualmente de forma independente no editor de Apps Script.

Fluxo oficial:

```text
GitHub (rama de traballo)
  → revisión
  → código canónico Apps Script
  → Apps Script Preview (SCPP Script - Pruebas)
  → proba funcional
  → aprobación
  → o MESMO código canónico
  → Apps Script Producción
```

`clasp` úsase como ferramenta de sincronización e despregamento entre o código revisado e cada proxecto de Apps Script.

A decisión arquitectónica é que **Preview e Producción deben acabar executando o mesmo código fonte**. As diferenzas de ambiente deben estar nas Propiedades do script, no Script ID local de `clasp` e nos deployments, non en dúas variantes do código que evolucionen por separado.

## 2. Copias locais verificadas con clasp

En 2026-08-19 realizouse un `clasp clone` fresco de ambos proxectos reais.

Estrutura local utilizada:

```text
C:\Users\jcuinas\Mi unidad\SCPP-WEB\
├── AppsScript-Preview
└── AppsScript-Produccion
```

Estas carpetas son destinos de auditoría e despregamento. Non deben converterse en dúas fontes de código que evolucionen por separado.

### Preview

Proxecto: `SCPP Script - Pruebas`.

Ficheiros seguidos por clasp: 20.

Inclúe un ficheiro específico de ambiente no estado auditado:

- `configuracion-entorno.js`

`clasp deployments` mostrou 2 despregamentos no momento da auditoría.

### Producción

Ficheiros seguidos por clasp: 19.

Non contén `configuracion-entorno.js` no estado auditado.

`clasp deployments` mostrou 12 despregamentos no momento da auditoría.

## 3. Fotografías reais gardadas en GitHub

As dúas copias frescas están versionadas en:

```text
apps-script/snapshot-2026-08-19/
├── preview/
└── production/
```

Estas carpetas son **snapshots de auditoría** e non deben usarse como fonte ordinaria dun `clasp push`.

A comparación por SHA confirmou:

### Idénticos en ambos ambientes

```text
appsscript.json
ensaios-eliminar-ensaio.js
r2-fotos-portal.js
sincronizacion-medios-concertos.js
```

### Só en Preview

```text
configuracion-entorno.js
```

### Diverxentes

```text
aceptacion-portal.js
asistencias-concertos-portal.js
concertos-portal.js
Código.js
diagnostico-administrador-fotos.js
diagnostico.js
documentacion-portal.js
ensaios-portal.js
fotos-portal.js
perfil-portal.js
permisos-fotos-drive.js
persoas-administracion.js
probas-aceptacion-acceso.js
publicacions-web.js
solicitudes-web.js
```

O detalle da reconciliación está en `APPS-SCRIPT-RECONCILIACION-2026-08-19.md`.

## 4. Patrón de diferenzas verificado

A revisión de módulos representativos confirma que Preview avanzou cara a unha configuración máis segura:

- IDs e carpetas mediante `obterPropiedadeObrigatoria_()`;
- `WEB_TEST_EMAIL` mediante Script Properties;
- `SCPP_ENVIRONMENT` para distinguir test/production;
- `SCPP_ALLOW_WRITES` para bloquear escritura cando proceda;
- menos IDs e correos incrustados no código;
- eliminación dalgunhas funcións duplicadas.

Producción conserva aínda varios IDs e valores fixos dentro do código. A solución non é manter dúas variantes para sempre, senón levar esa parametrización ao código canónico común preservando a funcionalidade válida de Producción.

## 5. Estrutura obxectivo do repositorio

A estrutura final proposta é:

```text
apps-script/
├── current/                 # única fonte despregable
├── snapshot-2026-08-19/     # auditoría actual
│   ├── preview/
│   └── production/
└── canonical-2026-08-03/    # snapshot histórico
```

`apps-script/current/` será a única fonte de verdade de Apps Script.

Non se manterán copias `current-preview` e `current-production`, porque iso permitiría volver crear deriva.

## 6. Diferenzas permitidas entre ambientes

As diferenzas deben quedar fóra do código canónico.

### Preview

- `.clasp.json` local → Script ID de `SCPP Script - Pruebas`.
- Script Properties → valores de test.
- `SCPP_ENVIRONMENT=test`.
- `SCPP_ALLOW_WRITES` segundo o tipo de proba.
- deployments propios de Preview.

### Producción

- `.clasp.json` local → Script ID do proxecto de Producción.
- Script Properties → valores reais de Producción.
- `SCPP_ENVIRONMENT=production`.
- política de escritura de Producción.
- deployments de Producción.

`.clasp.json` non debe copiarse entre ambientes nin formar parte da fonte canónica despregable.

## 7. GitHub como fonte de verdade

A carpeta histórica:

```text
apps-script/canonical-2026-08-03/
```

é unha fotografía do 2026-08-03, non un espello garantido do estado actual.

A partir desta auditoría, calquera nova modificación de Apps Script debe:

1. nacer nunha rama de GitHub;
2. quedar revisada no repositorio;
3. formar parte de `apps-script/current/` cando a reconciliación estea completada;
4. chegar primeiro a Preview;
5. probarse contra o deployment de Preview;
6. chegar a Producción só desde o mesmo commit xa validado.

As edicións manuais directas no editor de Apps Script deben considerarse excepcións. Se se produce unha edición de emerxencia, debe facerse inmediatamente un `clasp pull`, gardar unha fotografía e reconciliarse con GitHub antes de continuar.

## 8. Procedemento seguro con clasp

### Auditoría / lectura

```powershell
clasp.cmd status
clasp.cmd pull
```

Antes dun `pull`, confirmar sempre a carpeta actual para evitar sobrescribir unha copia equivocada.

### Envío a Preview

1. comprobar que a carpeta actual é `AppsScript-Preview`;
2. conservar o `.clasp.json` propio de Preview;
3. copiar/sincronizar nela o contido aprobado de `apps-script/current/`;
4. executar `clasp.cmd status`;
5. revisar a diferenza;
6. executar `clasp.cmd push`;
7. verificar o proxecto remoto;
8. crear/actualizar versión ou deployment só cando sexa necesario para probar o Web App.

### Promoción a Producción

Só despois de validar Preview:

1. comprobar que a carpeta actual é `AppsScript-Produccion`;
2. conservar o `.clasp.json` propio de Producción;
3. copiar/sincronizar **exactamente o mesmo commit de `apps-script/current/`** validado en Preview;
4. executar `clasp.cmd status`;
5. revisar a diferenza final;
6. executar `clasp.cmd push`;
7. crear versión e actualizar o deployment de Producción de forma explícita se corresponde.

## 9. Regras de seguridade

- Non usar `clasp push --force` como rutina.
- Non copiar `.clasp.json` entre Preview e Producción.
- Non despregar directamente desde os snapshots.
- Non versionar tokens, claves, segredos nin valores das Propiedades do script.
- Non cambiar `SCPP_ALLOW_WRITES` sen saber exactamente a que fontes de datos apunta o ambiente.
- `clasp push` actualiza o código fonte (`HEAD`) do proxecto; a publicación dun Web App versionado é un paso distinto.
- Antes de calquera cambio de infraestrutura, conservar unha copia fresca obtida con `clasp pull` ou `clone`.
- Preview e Producción non deben diverxer funcionalmente unha vez pechada a reconciliación.

## 10. Próximo paso técnico

Antes de automatizar despregamentos hai que completar a reconciliación:

1. revisar os ficheiros diverxentes restantes;
2. construír `apps-script/current/` preservando toda funcionalidade válida e externalizando configuración;
3. validar as Script Properties necesarias en ambos ambientes;
4. facer unha primeira proba inocua GitHub → Preview;
5. promover o mesmo commit a Producción;
6. só entón valorar automatización adicional.

Ata completar `apps-script/current/`, non se considera seguro automatizar `clasp push` a Producción.