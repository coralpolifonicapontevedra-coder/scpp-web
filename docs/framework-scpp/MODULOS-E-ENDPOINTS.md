# Módulos e endpoints actuais

> Estado: inventario operativo inicial. Última revisión: 2026-08-03.
>
> Este documento non garante que todos os módulos estean consolidados. Describe as rutas atopadas no repositorio e o seu estado coñecido.

## 1. Páxinas privadas principais

| Área | Ruta oficial | Estado |
|---|---|---|
| Inicio do portal | `/portal/` | Operativa. |
| Subir fotografías | `/portal/fotos/` | Operativa; pendente de integración formal no Gestor de Arquivos. |
| Revisar fotografías | `/portal/revision-fotos/` | Operativa con código legado e variantes históricas. |
| Repertorio | `/portal/repertorio/` | Operativa. |
| Concertos | `/portal/concertos/` | A versión antes chamada `concertos-novo` é xa a oficial. |
| Galería privada | `/portal/galeria/` | Operativa; existen rutas históricas `galeria-nova`. |
| Documentación | `/portal/documentacion/` | Operativa; ficheiros aínda servidos desde Drive en Base64. |
| Administración de persoas | `/portal/administracion/persoas/` | Versión v2 oficial; fichas desde R2. |
| O meu perfil | pendente | O enlace continúa desactivado nalgúns menús. |
| Ensaios | pendente | Aínda non implementado. |

## 2. Endpoints privados e públicos localizados

### Administración e portal

- `/api/persoas-v2`: endpoint oficial de Administración de Persoas.
- `/api/persoas`: endpoint anterior, mantido temporalmente por compatibilidade.
- `/api/perfil`: datos do perfil do usuario.
- `/api/documentacion`: listado e descarga de Documentación.
- `/api/repertorio`: datos do Repertorio.
- `/api/concertos`: servizos relacionados con concertos.
- `/api/asistencias-concertos`: asistentes e informe de asistencia.
- `/api/aceptacion`: aceptación legal do portal.

### Fotografías e galerías

- `/api/fotos`: operacións do módulo de fotografías.
- `/api/editor-fotos`: edición ou revisión administrativa.
- `/api/galeria`: galería.
- `/api/galeria-privada`: galería con acceso autenticado.

### Formularios e servizos públicos

- `/api/solicitudes`: solicitudes e formularios públicos.
- `/arquivos/publico/*`: entrega de ficheiros públicos desde o almacenamento configurado.

### Diagnóstico

- `/api/r2-status`: comproba a presenza e accesibilidade dos bindings R2 público e privado.

## 3. Estado técnico por módulo

### Persoas

**Páxina:** `src/pages/portal/administracion/persoas.astro`

**Endpoint:** `functions/api/persoas-v2.js`

**Apps Script:** `apps-script/persoas-administracion.gs`

**Estado:** patrón de referencia actual.

Características:

- Firebase para identidade;
- Apps Script para autorización e metadatos;
- IDs estables, non `Row ID` como identificador principal;
- fichas servidas desde `R2_PRIVADO`;
- prefixo autorizado `persoas/fichas/`;
- caché separada do endpoint antigo;
- erros por etapas;
- 50 fichas sincronizadas e verificadas.

### Documentación

**Páxina:** `src/pages/portal/documentacion.astro`

**Endpoint:** `functions/api/documentacion.js`

**Apps Script:** `apps-script/documentacion-portal.gs`

**Estado:** listado optimizado; ficheiros pendentes de migración.

Débeda técnica principal:

```text
DriveApp
  → Blob
  → Base64
  → Worker
  → Uint8Array
  → navegador
```

Obxectivo:

```text
Apps Script valida permisos
  → devolve r2Key
  → Worker le R2_PRIVADO
  → navegador
```

### Concertos

**Páxina oficial:** `/portal/concertos/`

A versión nova foi promovida á ruta oficial. A ruta temporal debe limitarse a redirixir á oficial.

Fontes actuais coñecidas:

- CSV publicados para Concertos, ConcertosRepertorio e Repertorio;
- endpoint autenticado para AsistenciasConcertos.

Débeda técnica:

- unificar as fontes baixo a API común;
- evitar URLs CSV incrustadas na páxina;
- documentar cartelería e programas de man como ficheiros xestionados.

### Fotografías

O sistema xa utiliza R2 en varios fluxos, pero o comportamento está repartido entre subida, revisión, galería pública, galería privada e edición.

Antes de modificalo debe facerse un inventario específico de:

- prefixos R2;
- metadatos na Sheet `Fotos`;
- estados de revisión e publicación;
- miniaturas;
- diferencias entre público e privado;
- variantes históricas de rutas `*-nova`.

### Repertorio, partituras e audios

O Repertorio está operativo, pero debe auditarse como tres capas separadas:

1. datos das obras;
2. partituras;
3. audios.

As regras de agrupación funcional deben conservarse:

- Misa Brevis: audios separados por obras ou temas;
- Cantata da Leucoíña: audios separados por voces e escenas;
- non mostrar duplicados nin rexistros inactivos.

## 4. Libraría común de Apps Script

`functions/_lib/apps-script.js` é o helper compartido para chamar a Apps Script desde varios endpoints.

Situación actual:

- admite timeout;
- admite mecanismos de respaldo ou varias URLs en módulos antigos;
- reduce duplicación, pero tamén pode mesturar implementacións de distintas versións.

Norma para módulos novos:

- usar unha única implementación principal;
- non saltar silenciosamente a unha implementación antiga;
- mostrar a etapa do fallo;
- introducir respaldo só cunha decisión documentada.

## 5. Convención de erros para endpoints novos

Resposta JSON mínima:

```json
{
  "ok": false,
  "etapa": "APPS_SCRIPT",
  "codigo": "TIMEOUT",
  "erro": "Descrición útil do fallo"
}
```

Etapas recomendadas:

- `REQUEST`
- `CONFIG`
- `AUTH`
- `FIREBASE`
- `PERMISOS`
- `APPS_SCRIPT`
- `APPS_SCRIPT_RESULT`
- `R2_BINDING`
- `R2_KEY`
- `R2_OBJECT`
- `CACHE`

## 6. Rutas temporais e código legado

Atopáronse nomes históricos como:

- `concertos-novo`
- `galeria-nova`
- `revision-fotos-nova`
- endpoint antigo `/api/persoas`

Criterio oficial:

1. A versión nova pruébase nunha ruta illada.
2. Cando está validada, substitúe a ruta oficial.
3. A ruta temporal redirixe á oficial durante un período curto.
4. Despois elimínase o código duplicado.
5. Non se manteñen indefinidamente nomes `nova`, `v2`, `final` ou equivalentes na interface pública.

## 7. Próxima auditoría técnica

Prioridade inmediata:

1. inventariar o proxecto Apps Script e o `doPost` completo;
2. verificar variables e bindings reais nos ambientes Production e Preview;
3. inventariar Documentación e Actas en Drive e R2;
4. crear o núcleo do Gestor de Arquivos;
5. retirar progresivamente endpoints e rutas antigas unha vez comprobada a nova versión.
