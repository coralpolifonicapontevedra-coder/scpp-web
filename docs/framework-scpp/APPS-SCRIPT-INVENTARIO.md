# Inventario de Apps Script da SCPP

Estado: **inventario funcional confirmado do ficheiro principal; inventario de ficheiros do proxecto aínda incompleto**  
Data de revisión: 2026-08-03

## 1. Obxectivo

Este documento identifica o despachador, as accións, propiedades, dependencias, follas e débeda técnica do proxecto Apps Script que atende o portal privado da SCPP.

A fonte principal desta revisión é a copia actual de `Código.gs` recibida o 03/08/2026, con 1.988 liñas. Esta copia substitúe como referencia a copia histórica de 792 liñas usada no primeiro inventario.

## 2. Alcance confirmado

Queda confirmado o contido funcional do ficheiro principal `Código.gs`:

- `doGet(e)`;
- `doPost(e)`;
- configuración inicial do portal;
- autenticación mediante `WEB_WRITE_TOKEN`;
- alta e consulta de usuarios web;
- aceptación legal;
- perfil persoal;
- concertos e documentos de concertos;
- fotografías;
- repertorio, partituras e audios;
- asistencias a concertos;
- documentación e actas;
- administración de persoas;
- auditoría de accesos.

Segue pendente confirmar a lista exacta de todos os ficheiros que aparecen no editor de Apps Script e comprobar se existen funcións duplicadas entre eles.

## 3. Entrada HTTP

### `doGet(e)`

Comportamento confirmado:

- se `recurso=publicacions`, chama `listarPublicacionsWeb_()`;
- no resto dos casos devolve o estado básico do servizo;
- captura erros e responde sempre en JSON.

### `doPost(e)`

Responsabilidades actuais:

1. interpretar o JSON recibido;
2. normalizar `accion` e correo;
3. validar `WEB_WRITE_TOKEN`;
4. adquirir `ScriptLock` nas escrituras que o requiren;
5. despachar a acción;
6. rexistrar parte das operacións en `RexistroAccesosWeb`;
7. devolver JSON;
8. liberar o lock no bloque `finally`.

O despachador contén demasiada lóxica e debería reducirse no futuro a un mapa de accións.

## 4. Mapa real de accións de `doPost`

| Acción | Función ou fluxo | Escritura | Lock explícito | Módulo |
|---|---|---:|---:|---|
| `rexistrarSolicitudeWeb` | `rexistrarSolicitudeWeb_(datos)` | Si | Si | Solicitudes |
| `comprobarAceptacion` | `tenAceptacionVixente_(correo, version)` | Pode crear contexto de usuario indirectamente, pero a acción é lectura | Non | Portal / Aceptación |
| `rexistrarAceptacion` | `obterOuCrearUsuarioWebPorEmail_()` + `rexistrarAceptacion()` | Si | Si | Aceptación |
| `obterPerfil` | `obterPerfilPortal_(datos)` | Non | Non | Perfil |
| `actualizarPerfil` | `actualizarPerfilPortal_(datos)` | Si | Si | Perfil |
| `obterDocumentoConcerto` | `obterDocumentoConcerto_(datos)` | Non | Non | Concertos |
| `subirFoto` | `subirFotoPortal_(datos)` | Si | Si | Fotos |
| `listarFotosRevision` | `listarFotosRevisionPortal_(datos)` | Non | Non | Fotos |
| `listarFotosGaleria` | `listarFotosGaleriaPortal_()` | Non | Non | Fotos |
| `actualizarRevisionFoto` | `actualizarRevisionFotoPortal_(datos)` | Si | Si | Fotos |
| `listarFotosPublicadas` | `listarFotosPublicadasPortal_(datos)` | Non | Non | Fotos |
| `actualizarPublicacionFoto` | `actualizarPublicacionFotoPortal_(datos)` | Si | Non no despachador actual | Fotos |
| `obterFotoParaR2` | `obterFotoParaR2Portal_(datos)` | Non | Non | Fotos / R2 |
| `listarFotosPendentesR2` | `listarFotosPendentesR2Portal_(datos)` | Non | Non | Fotos / R2 |
| `gardarRutasFotoR2` | `gardarRutasFotoR2Portal_(datos)` | Si | Non no despachador actual | Fotos / R2 |
| `listarRepertorioPortal` | `listarRepertorioPortal_(datos)` | Non | Non | Repertorio |
| `listarAsistenciasConcertosPortal` | `listarAsistenciasConcertosPortal_(datos)` | Non | Non | Concertos |
| `obterFicheiroRepertorio` | `obterFicheiroRepertorio_(datos)` | Non | Non | Repertorio |
| `listarDocumentacionPortal` | `listarDocumentacionPortal_(datos)` | Non | Non | Documentación |
| `obterFicheiroDocumentacion` | `obterFicheiroDocumentacion_(datos)` | Non | Non | Documentación |
| `listarPersoasAdministracion` | `listarPersoasAdministracion_(datos)` | Non | Non | Administración |
| `obterFichaPersoaAdministracion` | `obterFichaPersoaAdministracion_(datos)` | Non | Non | Administración |
| `actualizarObservacions` | lóxica interna no propio `doPost` | Si | Si | UsuariosWeb / proba herdada |

Calquera outra acción devolve `Acción non permitida`.

## 5. Módulos e estado da arquitectura de ficheiros

### 5.1. Administración de Persoas

Estado: **modelo de referencia actual**.

- `listarPersoasAdministracion_(datos)` devolve o catálogo de persoas.
- `obterFichaPersoaAdministracion_(datos)` valida permisos e devolve `FichaR2Key` e metadatos.
- O Worker le `R2_PRIVADO`.
- Non usa Drive nin Base64 para servir a ficha.

### 5.2. Documentación e Actas

Estado: **pendente de migración a R2**.

- O catálogo sae de Sheets.
- `obterFicheiroDocumentacion_(datos)` segue buscando o documento en Drive.
- O ficheiro viaxa en Base64.

### 5.3. Repertorio

Estado: **catálogo en Sheets; descarga heredada desde Drive**.

`listarRepertorioPortal_(datos)` abre por ID explícito:

- `Repertorio`;
- `AudiosRepertorio`;
- `Partituras`;
- `ConcertosRepertorio`;
- `Concertos`.

`obterFicheiroRepertorio_(datos)` segue:

- validando unha ruta de dúas partes;
- buscando por nome en carpetas permitidas de Drive;
- lendo o blob;
- devolvendo Base64.

Este fluxo debe migrarse ao Gestor de Arquivos e R2.

### 5.4. Fotografías

Estado: **arquitectura mixta**.

Hai accións específicas para:

- subir;
- revisar;
- listar galería;
- xestionar publicación;
- localizar pendentes de R2;
- gardar rutas R2.

Debe inventariarse cada ficheiro do módulo antes de consolidalo no Gestor de Arquivos.

### 5.5. Concertos e asistencias

- As asistencias léense desde `AsistenciasConcertos`.
- O código elimina duplicados por concerto, nome e voz.
- Os documentos de concerto deben revisarse por separado para confirmar se usan Drive/Base64 ou R2.

### 5.6. Perfil

- `obterPerfil` e `actualizarPerfil` están despachadas no ficheiro principal.
- As súas implementacións están noutro ficheiro do proxecto e deben incorporarse ao inventario de ficheiros.

## 6. Libros e follas identificados

### Acceso e identidade

- `UsuariosWeb`
- `Persoas`
- `Aceptación`
- `RexistroAccesosWeb`

### Repertorio

- `Repertorio`
- `AudiosRepertorio`
- `Partituras`
- `ConcertosRepertorio`
- `Concertos`

### Concertos

- `AsistenciasConcertos`

### Documentación

- `Documentación`
- `Actas XD e AX`

### Fotografías

- `Fotos`

## 7. Propiedades de Script coñecidas

| Propiedade | Uso | Clasificación |
|---|---|---|
| `WEB_WRITE_TOKEN` | autenticación Worker → Apps Script | Segredo obrigatorio |
| `WEB_TEST_EMAIL` | proba histórica `actualizarObservacions` | Herdada / revisar |
| `USUARIOS_WEB_SPREADSHEET_ID` | abrir directamente `UsuariosWeb` | Configuración |
| `PERSOAS_SPREADSHEET_ID` | abrir directamente `Persoas` | Configuración |

Non se gardarán valores reais destas propiedades no repositorio.

## 8. Servizos de Apps Script utilizados

- `PropertiesService`
- `SpreadsheetApp`
- `LockService`
- `CacheService`
- `ContentService`
- `Utilities`
- `Session`
- `DriveApp`

`DriveApp` queda considerado temporal para os fluxos de entrega de ficheiros.

## 9. Utilidades compartidas confirmadas

- `respostaJSON(datos)`
- `obterFollaUsuariosWeb_()`
- `buscarUsuarioWebPorEmail_(correo)`
- `obterOuCrearUsuarioWebPorEmail_(correo)`
- `obterPersoaActivaPorEmail_(correo)`
- `obterFollaPersoas_()`
- `normalizarCabeceiraPortal_(valor)`
- `indiceCabeceiraPortal_(...)`
- validadores de cabeceiras;
- `valorBooleanoPortal_(valor)`
- `valorActivoPersoaPortal_(valor)`
- `rexistrarAcceso(datos)`

## 10. Problemas técnicos detectados

### 10.1. Ficheiro principal demasiado grande

`Código.gs` concentra despachador, configuración, acceso, aceptación, repertorio, asistencias, utilidades e probas. Debe dividirse sen cambiar primeiro o comportamento público.

### 10.2. Lóxica de negocio dentro de `doPost`

A acción `actualizarObservacions` está implementada directamente no despachador. Debe extraerse ou retirarse se xa non é necesaria.

### 10.3. Lock inconsistente

Hai accións de escritura, como `actualizarPublicacionFoto` e `gardarRutasFotoR2`, que non adquiren lock no despachador. Debe verificarse se bloquean internamente.

### 10.4. Rexistro síncrono

`rexistrarAcceso()` fai `appendRow()` e `SpreadsheetApp.flush()` durante numerosas peticións. Isto engade latencia e pode explicar parte dos tempos de espera.

### 10.5. IDs embebidos

Varios IDs de libros, follas e carpetas están escritos directamente no código. Deben trasladarse progresivamente a configuración central, sen tratar os IDs públicos como segredos.

### 10.6. Drive e Base64

Os fluxos de Repertorio e Documentación aínda transportan ficheiros completos desde Drive en Base64. Isto incumpre o patrón obxectivo do Framework SCPP.

### 10.7. Compatibilidade con `Row ID`

O código novo xa prioriza IDs estables, pero aínda conserva compatibilidade con `Row ID` nalgúns módulos. Esta compatibilidade debe ter unha data de retirada.

### 10.8. Nomenclatura de voces

No repertorio aínda aparece `Contraalto`, mentres a nomenclatura actual é `Contralto`. Debe revisarse a normalización para evitar agrupacións inconsistentes.

## 11. Clasificación proposta dos ficheiros

| Prefixo | Grupo |
|---|---|
| `00-` | Core HTTP e despachador |
| `10-` | Identidade, UsuariosWeb e permisos |
| `20-` | Auditoría |
| `30-` | Aceptación legal |
| `40-` | Perfil e Persoas |
| `50-` | Documentación e Actas |
| `60-` | Fotografías |
| `70-` | Repertorio, Partituras e Audios |
| `80-` | Concertos e Asistencias |
| `90-` | Probas, diagnósticos e migracións |

Esta clasificación é documental. Non se renomeará nada no editor de produción ata completar as probas.

## 12. Contrato futuro do despachador

O `doPost` futuro debe:

1. interpretar a entrada;
2. validar o token;
3. normalizar identidade e acción;
4. consultar un mapa de accións;
5. aplicar lock segundo configuración;
6. chamar unha función de módulo;
7. devolver unha resposta uniforme;
8. rexistrar métricas e auditoría sen bloquear a resposta máis do necesario.

Exemplo conceptual:

```javascript
const ACCIONS = {
  listarPersoasAdministracion: {
    handler: listarPersoasAdministracion_,
    lock: false,
    modulo: 'Administración'
  }
};
```

## 13. Pendentes para pechar o inventario

1. Capturar a lista exacta de ficheiros visibles no editor.
2. Copiar ou exportar cada ficheiro actual.
3. Detectar funcións duplicadas entre ficheiros.
4. Confirmar nomes das propiedades de script desde Configuración do proxecto.
5. Confirmar zona horaria.
6. Confirmar servizos avanzados.
7. Confirmar desencadeadores instalados.
8. Confirmar implementación activa e versión publicada.
9. Versionar en GitHub unha copia canónica completa do proxecto Apps Script.

## 14. Próxima acción segura

Non reorganizar aínda o proxecto de produción.

O seguinte paso é obter a lista de ficheiros do editor e comparala coas funcións referenciadas por `Código.gs`. Con esa lista poderemos crear un mapa exacto:

```text
acción → función → ficheiro → Sheets/Drive/R2 → Worker consumidor
```

Despois prepararase unha copia canónica en GitHub e unha refactorización por fases, sempre mantendo a implementación pública actual ata superar probas de compatibilidade.
