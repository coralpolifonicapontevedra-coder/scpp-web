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
  → Apps Script Preview (SCPP Script - Pruebas)
  → proba funcional
  → aprobación
  → Apps Script Producción
```

`clasp` úsase como ferramenta de sincronización e despregamento entre o código revisado e cada proxecto de Apps Script.

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

Inclúe un ficheiro específico de ambiente:

- `configuracion-entorno.js`

`clasp deployments` mostrou 2 despregamentos no momento da auditoría.

### Producción

Ficheiros seguidos por clasp: 19.

Non contén `configuracion-entorno.js` no estado auditado.

`clasp deployments` mostrou 12 despregamentos no momento da auditoría.

## 3. Inventario actual observado

Ficheiros presentes en ambos proxectos no momento da auditoría:

```text
aceptacion-portal.js
appsscript.json
asistencias-concertos-portal.js
Código.js
concertos-portal.js
diagnostico-administrador-fotos.js
diagnostico.js
documentacion-portal.js
ensaios-eliminar-ensaio.js
ensaios-portal.js
fotos-portal.js
perfil-portal.js
permisos-fotos-drive.js
persoas-administracion.js
probas-aceptacion-acceso.js
publicacions-web.js
r2-fotos-portal.js
sincronizacion-medios-concertos.js
solicitudes-web.js
```

Só en Preview:

```text
configuracion-entorno.js
```

## 4. Estado da comparación Preview vs Producción

A comparación SHA-256 realizada en 2026-08-19 confirmou que Preview e Producción non son copias idénticas.

Ficheiros que presentaban diferenzas de contido:

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

Polo tanto, nunca se debe copiar Preview completo sobre Producción nin Producción completo sobre Preview sen revisar primeiro as diferenzas.

## 5. Protección específica de Preview

`configuracion-entorno.js` centraliza a separación de ambiente mediante Propiedades do script.

Conceptos principais:

- `SCPP_ENVIRONMENT`: debe ser `test` ou `production`.
- `SCPP_ALLOW_WRITES`: controla se se permiten operacións de escritura.
- Os IDs de Sheets, carpetas, correos e segredos deben vivir nas Propiedades do script e non no código fonte.
- `validarAccionPermitidaEntorno_()` bloquea accións de escritura cando `SCPP_ALLOW_WRITES` non é `true`.

No estado auditado, a configuración de Preview estaba incompleta: `validarConfiguracionEntorno()` informou varias propiedades obrigatorias ausentes. Isto debe resolverse como tarefa de infraestrutura antes de considerar Preview un ambiente plenamente reproducible.

## 6. GitHub como fonte de verdade

A carpeta histórica:

```text
apps-script/canonical-2026-08-03/
```

é unha fotografía canónica do 2026-08-03, non un espello garantido do estado actual. O seu propio README xa indica que non debe despregarse automaticamente.

A partir desta auditoría, calquera nova modificación de Apps Script debe:

1. nacer nunha rama de GitHub;
2. quedar revisada no repositorio;
3. chegar primeiro a Preview;
4. probarse contra o despregamento de Preview;
5. chegar a Producción só despois da validación.

As edicións manuais directas no editor de Apps Script deben considerarse excepcións. Se se produce unha edición de emerxencia, debe facerse inmediatamente un `clasp pull` e reconciliarse con GitHub antes de continuar o desenvolvemento.

## 7. Procedemento seguro con clasp

### Auditoría / lectura

```powershell
clasp.cmd status
clasp.cmd pull
```

Antes dun `pull`, confirmar sempre a carpeta actual para evitar sobrescribir unha copia equivocada.

### Envío a Preview

1. comprobar que a carpeta actual é `AppsScript-Preview`;
2. comprobar `.clasp.json` e o proxecto destino;
3. executar `clasp.cmd status`;
4. revisar as diferenzas co código aprobado en GitHub;
5. executar `clasp.cmd push`;
6. verificar o proxecto remoto;
7. crear/actualizar versión ou deployment só cando sexa necesario para probar o Web App.

### Envío a Producción

Só despois de validar Preview:

1. comprobar que a carpeta actual é `AppsScript-Produccion`;
2. incorporar exactamente o cambio aprobado para Producción, preservando as diferenzas propias do ambiente;
3. executar `clasp.cmd status`;
4. revisar a diferenza final;
5. executar `clasp.cmd push`;
6. crear versión e actualizar o deployment de Producción de forma explícita se corresponde.

## 8. Regras de seguridade

- Non usar `clasp push --force` como rutina.
- Non copiar unha carpeta completa entre Preview e Producción.
- Non versionar `.clasp.json` se contén identificadores que se queira manter fóra do repositorio.
- Non versionar tokens, claves, segredos nin valores das Propiedades do script.
- Non cambiar `SCPP_ALLOW_WRITES` sen saber exactamente a que fontes de datos apunta o ambiente.
- `clasp push` actualiza o código fonte (`HEAD`) do proxecto; a publicación dun Web App versionado é un paso distinto.
- Antes de calquera cambio de infraestrutura, conservar unha copia fresca obtida con `clasp pull` ou `clone`.

## 9. Próximo paso técnico

Antes de automatizar despregamentos hai que completar unha reconciliación do código actual:

1. importar a GitHub unha fotografía fresca de Preview e Producción obtida en 2026-08-19;
2. clasificar cada diferenza como:
   - común;
   - específica de ambiente;
   - cambio funcional pendente de reconciliar;
3. definir a estrutura definitiva do código Apps Script no repositorio;
4. probar un cambio inocuo GitHub → Preview → verificación;
5. só entón valorar automatización adicional.

Ata completar esa reconciliación, non se considera seguro facer sincronización automática de Producción desde GitHub.