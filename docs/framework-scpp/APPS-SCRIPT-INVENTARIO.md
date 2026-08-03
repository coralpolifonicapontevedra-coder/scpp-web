# Inventario de Apps Script da SCPP

Estado: **inventario inicial, parcialmente confirmado**  
Data de revisión: 2026-08-03

## 1. Obxectivo

Este documento identifica os ficheiros, accións, propiedades, dependencias e débeda técnica do proxecto Apps Script que atende o portal privado da SCPP.

A regra de traballo é distinguir sempre entre:

- **Confirmado no código actual**: funcións ou accións verificadas nunha copia recente.
- **Confirmado polo consumo web**: accións invocadas polos Workers e páxinas, aínda que o seu despachador non estea consolidado no repositorio.
- **Histórico ou potencialmente obsoleto**: código conservado en copias anteriores que non debe asumirse como despregado.
- **Pendente de verificar no editor real**: elementos que só se poden confirmar comparando co proxecto publicado en Apps Script.

## 2. Fontes utilizadas

O inventario inicial parte de:

- unha copia de `Código.gs` de 792 liñas conservada na biblioteca de traballo;
- `persoas-administracion-v3.gs`, versión recente do módulo de administración de persoas;
- os ficheiros baixo `apps-script/` e `scripts/apps-script/` do repositorio;
- os endpoints de Cloudflare Functions que invocan accións de Apps Script.

A copia de `Código.gs` non se considera automaticamente o estado actual do despregamento.

## 3. Estrutura funcional coñecida

### 3.1. Ficheiro principal histórico: `Código.gs`

A copia revisada contén:

- `configurarProba()`;
- `doGet()`;
- `doPost(e)`;
- autenticación mediante `WEB_WRITE_TOKEN`;
- comprobación opcional de `WEB_TEST_EMAIL` para unha acción de proba;
- rexistro de accesos;
- aceptación da política de privacidade;
- subida e revisión de fotografías;
- resposta JSON común.

### 3.2. Accións que despacha esta copia de `doPost`

| Acción | Función chamada | Escritura | Lock | Estado do inventario |
|---|---|---:|---:|---|
| `comprobarAceptacion` | `comprobarAceptacion(...)` | Non | Non | Confirmada na copia histórica |
| `rexistrarAceptacion` | `rexistrarAceptacion(...)` | Si | Si | Confirmada na copia histórica |
| `subirFoto` | `subirFotoPortal_(datos)` | Si | Si | Confirmada na copia histórica |
| `listarFotosRevision` | `listarFotosRevisionPortal_(datos)` | Non | Non | Confirmada na copia histórica |
| `actualizarRevisionFoto` | `actualizarRevisionFotoPortal_(datos)` | Si | Si | Confirmada na copia histórica |
| `actualizarObservacions` | lóxica interna de `doPost` | Si | Si | Acción de proba, non patrón definitivo |

Calquera outra acción devolve `Acción non permitida` nesta copia.

## 4. Accións actuais confirmadas fóra da copia histórica

Estas accións están confirmadas por módulos recentes e/ou polos endpoints que as consumen, pero non aparecen no `doPost` histórico revisado. Polo tanto, o proxecto despregado debe conter un despachador máis novo ou ficheiros adicionais.

| Acción | Módulo | Función de Apps Script esperada | Estado |
|---|---|---|---|
| `listarPersoasAdministracion` | Administración de Persoas | `listarPersoasAdministracion_(datos)` | Confirmada en `persoas-administracion-v3.gs` |
| `obterFichaPersoaAdministracion` | Administración de Persoas | `obterFichaPersoaAdministracion_(datos)` | Confirmada en `persoas-administracion-v3.gs` |
| `listarDocumentacionPortal` | Documentación | `listarDocumentacionPortal_(datos)` | Confirmada no repositorio |
| `obterFicheiroDocumentacion` | Documentación | `obterFicheiroDocumentacion_(datos)` | Confirmada no repositorio, aínda usa Drive/Base64 |
| accións de repertorio | Repertorio | por inventariar | Confirmadas polo endpoint, pendentes de mapear |
| accións de asistencias | Concertos | por inventariar | Confirmadas polo endpoint, pendentes de mapear |
| accións de galería e fotos publicadas | Fotografías | por inventariar | Confirmadas polos endpoints, pendentes de mapear |

## 5. Módulo de Administración de Persoas

### Ficheiro

`persoas-administracion-v3.gs`

### Funcións públicas do módulo

- `listarPersoasAdministracion_(datos)`
- `obterFichaPersoaAdministracion_(datos)`

### Funcións auxiliares principais

- `obterContextoPersoasAdmin_()`
- `obterAdministradorPersoasAdmin_(...)`
- `construirPersoaAdmin_(...)`
- `indicesPersoasAdmin_(...)`
- `requireHeaderPersoasAdmin_(...)`
- funcións de normalización, booleanos e datas.

### Comportamento relevante

- abre as follas mediante IDs explícitos;
- le `Persoas` unha única vez por operación de listado;
- acepta `Id` e mantén compatibilidade temporal con `Row ID`;
- valida administración mediante campo explícito, cargo ou módulo permitido;
- usa `CacheService` para o perfil administrativo;
- non le o PDF desde Drive;
- devolve `FichaR2Key`, estado, MIME, ETag e tamaño;
- o Worker é responsable de ler `R2_PRIVADO`.

### Dependencias de columnas

Obrigatorias para o fluxo actual:

- `Id`
- `FichaR2Key`
- `FichaR2Estado`

Campos adicionais utilizados no listado:

- `Row ID` durante a compatibilidade;
- `Nome`, `Primeiro apelido`, `Segundo apelido`;
- `Voz`, `NIF`, `Teléfono`, `Correo electrónico`;
- `Enderezo`, `Cidade`, `CP`;
- `Activo`, `MostrarWeb`, `Cargo`, `Tipo de socio`;
- `DataNacemento`, `DataIncorporacionSCPP`;
- `ContactoEmerxencia`, `TelefonoEmerxencia`;
- consentimentos, observacións e campos de auditoría.

## 6. Propiedades do script coñecidas

| Propiedade | Uso | Clasificación |
|---|---|---|
| `WEB_WRITE_TOKEN` | autenticación entre Worker e Apps Script | Segredo obrigatorio |
| `WEB_TEST_EMAIL` | probas históricas e acción restrinxida de observacións | Temporal/herdada |
| `USUARIOS_WEB_SPREADSHEET_ID` | acceso directo ao libro de usuarios en versións posteriores | Configuración |
| `PERSOAS_SPREADSHEET_ID` | acceso directo ao libro de persoas en versións posteriores | Configuración |

Non se deben gardar valores reais destas propiedades no repositorio.

## 7. Follas e libros identificados

### `UsuariosWeb`

Campos utilizados ou esperados:

- `Row ID`
- `Persoa`
- `Email`
- `Nome`
- `Activo`
- `Administrador`
- `ModulosPermitidos`
- `DataAlta`
- `DataBaixa`
- `Observacions`

### `Persoas`

É a fonte principal para identidade, cargo, datos de contacto, administración e fichas R2.

### `Aceptación`

Utilizada para comprobar e rexistrar aceptacións vixentes da política de privacidade.

### `RexistroAccesosWeb`

Utilizada para rexistrar eventos, resultados e detalles de acceso.

### `Fotos`

Utilizada polos módulos de subida, revisión, galería e publicación.

### `Documentación` e `Actas XD e AX`

Utilizadas polo portal documental. Na situación actual os metadatos están en Sheets, pero os PDF aínda se serven desde Drive mediante Base64.

## 8. Servizos de Apps Script usados

- `PropertiesService`
- `SpreadsheetApp`
- `LockService`
- `CacheService`
- `ContentService`
- `Utilities`
- `Session`
- `DriveApp` nos módulos aínda non migrados a R2

## 9. Problemas detectados

### 9.1. Diverxencia entre código conservado e código despregado

A copia principal de `Código.gs` non contén varias accións actualmente operativas. Non debe utilizarse como copia completa de restauración.

### 9.2. Despachador non versionado de forma íntegra

O `doPost` real, co conxunto completo de accións activas, non está consolidado nun ficheiro único e verificable no repositorio.

### 9.3. IDs embebidos

Algúns módulos conteñen IDs de libros e follas directamente no código. Non son segredos, pero dificultan cambios de contorno e probas.

### 9.4. Duplicación de utilidades

Hai varias funcións de normalización de emails, cabeceiras, booleanos, datas e autorizacións con nomes diferentes.

### 9.5. Mestura de código de proba e produción

`configurarProba`, `WEB_TEST_EMAIL`, `actualizarObservacions` e funcións manuais de comprobación comparten ficheiro co despachador de produción.

### 9.6. Lock global potencialmente excesivo

O `ScriptLock` úsase en operacións de escritura, pero debe revisarse que non se adquira antes de lecturas custosas nin se manteña máis tempo do necesario.

### 9.7. Rexistro síncrono

`rexistrarAcceso()` fai `appendRow()` e `flush()`. Isto engade latencia ás peticións nas que se utiliza.

### 9.8. Drive e Base64

Documentación aínda le os ficheiros en Drive e os converte a Base64. Este patrón queda declarado como temporal e debe desaparecer coa migración a R2.

## 10. Clasificación proposta dos ficheiros

| Grupo | Contido |
|---|---|
| `00-core` | `doGet`, `doPost`, resposta JSON, validación do token |
| `10-auth` | UsuariosWeb, perfís, permisos e niveis |
| `20-audit` | Rexistro de accesos e trazabilidade |
| `30-aceptacion` | RGPD e aceptación legal |
| `40-persoas` | perfil e administración de persoas |
| `50-documentacion` | documentos e actas |
| `60-fotos` | subida, revisión, galería e publicación |
| `70-repertorio` | obras, audios e partituras |
| `80-concertos` | concertos e asistencias |
| `90-tests` | probas manuais, diagnósticos e migracións |

Esta clasificación é documental; non se renomearán ficheiros no proxecto real ata completar o inventario.

## 11. Contrato futuro do despachador

O despachador debe limitarse a:

1. interpretar JSON;
2. validar `WEB_WRITE_TOKEN`;
3. normalizar `accion`, `email` e identificadores;
4. consultar un mapa explícito de accións;
5. aplicar lock só cando a acción o requira;
6. chamar unha única función de módulo;
7. devolver JSON consistente;
8. rexistrar métricas e erros sen ocultar a etapa real.

O despachador non debe conter lóxica de negocio extensa.

## 12. Datos pendentes para completar o inventario

Para converter este documento en inventario definitivo é necesario obter do editor real de Apps Script:

1. nome exacto de todos os ficheiros do proxecto;
2. contido actual de `Código.gs`;
3. mapa completo de accións de `doPost`;
4. lista de propiedades do script, sen valores secretos;
5. implementación activa e número/descrición da versión;
6. zona horaria do proxecto;
7. servizos avanzados habilitados;
8. desencadeadores instalados;
9. funcións duplicadas entre ficheiros;
10. módulos presentes no editor que non están en GitHub.

## 13. Próxima acción segura

Non se debe substituír nin reorganizar o proxecto real aínda.

O seguinte paso é copiar ou exportar os ficheiros actuais do editor de Apps Script e comparalos co inventario. Unha vez feita esa comparación, crearase en GitHub unha copia canónica do proxecto e un despachador documentado, sen modificar a implementación pública ata superar as probas de compatibilidade.
