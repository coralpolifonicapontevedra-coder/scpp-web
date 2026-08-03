# Configuración operativa real do sistema

> Estado: documento vivo. Última revisión: 2026-08-03.
>
> Este ficheiro describe o que está confirmado no código do repositorio. Os nomes e valores secretos non se publican. A configuración que só existe no panel de Cloudflare ou en Google Apps Script queda marcada como **pendente de verificación externa**.

## 1. Despregamento principal

- Repositorio: `coralpolifonicapontevedra-coder/scpp-web`.
- Rama de produción: `main`.
- Hospedaxe: Cloudflare Pages.
- URL de produción: `https://scpp-web.pages.dev/`.
- Framework de interface: Astro.
- Backend perimetral: Cloudflare Pages Functions, dentro de `functions/`.
- Autenticación do portal privado: Firebase Authentication.
- Backend de datos e permisos: Google Apps Script.
- Almacenamento operativo de ficheiros: Cloudflare R2.
- Metadatos e datos de negocio: Google Sheets.
- Drive: orixe de traballo e legado; non debe ser a fonte de descarga final da web.

## 2. Bindings e variables de Cloudflare confirmados polo código

### Variables obrigatorias

| Nome | Tipo | Uso |
|---|---|---|
| `FIREBASE_API_KEY` | variable | Validación de tokens Firebase desde os Workers. |
| `WEB_WRITE_TOKEN` | segredo | Autenticación interna das chamadas Worker → Apps Script. |
| `APPS_SCRIPT_WEBAPP_URL` | variable | URL principal da implementación `/exec` de Apps Script. |

### Bindings R2

| Nome | Tipo | Uso |
|---|---|---|
| `R2_PRIVADO` | R2 bucket binding | Fichas persoais e outros ficheiros privados. Confirmado operativo mediante `/api/r2-status`. |
| `R2_PUBLICO` | R2 bucket binding | Recursos públicos, cando o módulo o requira. Confirmado operativo mediante `/api/r2-status`. |

### Configuración histórica ou de respaldo

O helper `functions/_lib/apps-script.js` e algúns endpoints antigos admiten varias implementacións de Apps Script ou mecanismos de respaldo. Esta capacidade considérase legado e non debe incorporarse aos novos módulos sen unha decisión técnica expresa.

## 3. Configuración que debe comprobarse no panel de Cloudflare

Os seguintes datos non deben gardarse con valores reais no repositorio:

- Nome físico dos buckets aos que apuntan `R2_PRIVADO` e `R2_PUBLICO`.
- Valores de `FIREBASE_API_KEY`, `WEB_WRITE_TOKEN` e `APPS_SCRIPT_WEBAPP_URL`.
- Variables separadas entre os ambientes **Production** e **Preview**.
- Rama de produción configurada no proxecto Pages.
- Comando e directorio de build efectivos.

Lista de comprobación externa:

- [ ] `R2_PRIVADO` existe en Production e apunta ao bucket privado correcto.
- [ ] `R2_PUBLICO` existe en Production e apunta ao bucket público correcto.
- [ ] Os bindings necesarios tamén existen en Preview, cando proceda.
- [ ] `APPS_SCRIPT_WEBAPP_URL` corresponde á implementación principal vixente.
- [ ] `WEB_WRITE_TOKEN` coincide co token validado no `doPost`.
- [ ] Non hai variables antigas que provoquen chamadas a implementacións obsoletas.

## 4. Fluxo privado oficial

```text
Navegador autenticado
  → Firebase Authentication
  → Cloudflare Function
  → validación do ID token
  → Apps Script: permisos e metadatos
  → R2_PRIVADO: lectura do ficheiro
  → resposta binaria ao navegador
```

Regras:

1. Apps Script non debe devolver ficheiros en Base64.
2. Apps Script debe devolver unha clave R2 validada.
3. O Worker debe comprobar permisos antes de acceder a R2.
4. A clave debe limitarse ao prefixo autorizado do módulo.
5. O navegador nunca recibe credenciais de R2 nin acceso directo ao bucket privado.

## 5. Estado confirmado dos módulos de ficheiros

| Módulo | Datos | Ficheiros | Estado |
|---|---|---|---|
| Persoas | Apps Script + Sheet `Persoas` | `R2_PRIVADO`, prefixo `persoas/fichas/` | Migrado. 50 fichas sincronizadas; 7 persoas sen ficha. |
| Documentación | Apps Script + Sheets | Drive + Base64 | Pendente de migración ao Gestor de Arquivos. |
| Actas | Apps Script + Sheet `Actas XD e AX` | Drive + Base64 | Pendente de migración. |
| Fotografías | Sheets + endpoints propios | R2 xa usado en varios fluxos | Debe integrarse formalmente no Gestor de Arquivos. |
| Partituras | Sheets / Repertorio | Estado mixto | Pendente de auditoría. |
| Audios | Sheets / Repertorio | Estado mixto | Pendente de auditoría. |
| Carteis e programas | Concertos / Sheets | Estado por confirmar | Pendente de inventario. |

## 6. Apps Script

### Implementación principal

Os Workers novos deben utilizar exclusivamente `APPS_SCRIPT_WEBAPP_URL`.

A implementación debe:

- executarse coa conta propietaria autorizada;
- aceptar solicitudes desde os Workers;
- validar `WEB_WRITE_TOKEN` no despachador principal;
- devolver sempre JSON estruturado;
- conservar a mesma URL `/exec` ao publicar novas versións.

### Despachador `doPost`

O `doPost` real non está completamente versionado nun único ficheiro do repositorio. Os módulos documentan as accións que deben engadirse ao despachador, pero a correspondencia completa entre accións e ficheiros queda pendente dunha auditoría específica do proxecto Apps Script.

Accións confirmadas polo código actual:

- `listarPersoasAdministracion`
- `obterFichaPersoaAdministracion`
- `listarDocumentacionPortal`
- `obterFicheiroDocumentacion`
- accións de fotografías, perfil, repertorio, concertos, aceptación e solicitudes usadas polos endpoints correspondentes.

Lista de comprobación do despachador:

- [ ] Existe unha única validación inicial de `WEB_WRITE_TOKEN`.
- [ ] Cada acción se despacha unha soa vez.
- [ ] Non existen funcións duplicadas con nomes iguais en ficheiros distintos.
- [ ] Os erros inclúen `ok: false` e unha mensaxe útil.
- [ ] As operacións de ficheiros novas devolven `r2Key`, nunca `base64`.

## 7. Firebase

Firebase úsase para identificar usuarios do portal. O Worker valida o `idToken` mediante Identity Toolkit e comproba:

- que o token exista;
- que corresponda a un usuario;
- que o correo estea verificado;
- que o correo poida ser autorizado despois por Apps Script e `UsuariosWeb`.

A autorización funcional non depende só de Firebase. Firebase acredita a identidade; Apps Script decide o nivel e os permisos reais.

## 8. Caché

Patrón oficial para listaxes privadas:

- caché fresca curta, normalmente entre 5 e 10 minutos;
- respaldo de emerxencia, como máximo 24 horas;
- caché separada por usuario ou nivel de acceso;
- os ficheiros privados poden usar caché privada do navegador, pero nunca caché pública compartida;
- os cambios de permisos non deben quedar ocultos por unha caché longa.

Persoas v2 usa caché propia e unha única implementación principal de Apps Script. Documentación xa usa caché, pero aínda conserva o motor antigo de ficheiros Base64.

## 9. Segredos e protección de datos

Nunca se deben escribir en documentación, commits, logs ou respostas públicas:

- tokens completos;
- claves de contas de servizo;
- secretos de R2;
- contido de `GOOGLE_SERVICE_ACCOUNT_JSON`;
- datos persoais das persoas da Coral;
- URLs temporais privadas asinadas.

Os nomes das variables si deben documentarse; os valores, non.

## 10. Verificación operativa mínima

Antes de considerar estable unha modificación de infraestrutura:

1. Build de Astro en verde.
2. Despregamento de Cloudflare en verde.
3. Proba de autenticación.
4. Proba de listado en frío.
5. Proba de listado desde caché.
6. Proba de ficheiro R2 existente.
7. Proba controlada de ficheiro inexistente.
8. Confirmación de que o erro identifica a etapa.
9. Confirmación de que non se transporta Base64.
10. Actualización deste documento e de `DECISIONS.md` se cambia a arquitectura.
