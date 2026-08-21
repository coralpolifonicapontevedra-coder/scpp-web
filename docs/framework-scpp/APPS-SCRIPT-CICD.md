# Apps Script con GitHub e clasp

## Obxectivo

GitHub é a fonte canónica do código. Apps Script queda como contorno de
execución e mantén dous destinos independentes: probas e produción.

```text
Rama / PR → comprobación estática → Apps Script de probas
          → validación funcional → aprobación manual
          → versión inmutable → implementación de produción
```

## Estrutura

```text
apps-script/src/                      Código e manifesto
apps-script/src/configuracion-entorno.js
scripts/check-apps-script.mjs         Sintaxe e manifesto
scripts/audit-apps-script-config.mjs  Illamento e seguridade
.github/workflows/check-apps-script.yml
```

## Segredos e configuración

Nunca se versionan:

- `.clasprc.json`: credencial OAuth de clasp.
- `.clasp.json`: identificador do proxecto de destino.
- Propiedades do script, tokens, credenciais, correos ou IDs de datos.

Cada proxecto resolve Sheets, carpetas e destinatarios unicamente mediante
Propiedades do script. A auditoría automática rexeita identificadores ou
correos escritos no código, o uso do arquivo activo, procuras ambiguas en
Drive, IDs numéricos de folla e funcións globais duplicadas.

En GitHub Actions utilizaranse contornos protexidos e segredos separados:
`CLASPRC_JSON`, `CLASP_JSON_TEST` e `CLASP_JSON_PROD`.

## Contornos

### Probas

- Proxecto Apps Script independente.
- `SCPP_ENVIRONMENT=test`.
- `SCPP_ALLOW_WRITES=false` ao crealo.
- Copias de Sheets e carpetas de Drive.
- Propiedades e destinatarios específicos de probas.
- Implementación web diferente da de produción.
- A escritura só se activa despois de validar todas as copias.

### Produción

- Proxecto actual.
- `SCPP_ENVIRONMENT=production`.
- `SCPP_ALLOW_WRITES=true` só tras revisar a configuración.
- Despregue exclusivamente manual e aprobado.
- A implementación existente actualízase cunha nova versión.
- O commit promovido queda indicado na descrición da versión.

## Recuperación

Se unha versión falla, a implementación de produción pode volver a apuntar á
versión anterior sen modificar o código de GitHub. A incidencia e o rollback
deben quedar rexistrados.
