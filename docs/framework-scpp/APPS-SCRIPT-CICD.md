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
apps-script/src/                 Código e manifesto
scripts/check-apps-script.mjs    Comprobación local e CI
.github/workflows/check-apps-script.yml
```

## Segredos

Nunca se versionan:

- `.clasprc.json`: credencial OAuth de clasp.
- `.clasp.json`: identificador do proxecto de destino.
- Propiedades do script, tokens, credenciais ou IDs privados de datos.

En GitHub Actions utilizaranse contornos protexidos e segredos separados:
`CLASPRC_JSON`, `CLASP_JSON_TEST` e `CLASP_JSON_PROD`.

## Contornos

### Probas

- Proxecto Apps Script independente.
- Copias de Sheets e carpetas de Drive.
- Propiedades específicas de probas.
- Implementación web diferente da de produción.
- Ningunha operación debe escribir sobre datos reais.

### Produción

- Proxecto actual.
- Despregue exclusivamente manual e aprobado.
- A implementación existente actualízase cunha nova versión; non se crea unha
  URL distinta para cada cambio.
- O commit promovido queda indicado na descrición da versión.

## Recuperación

Se unha versión falla, a implementación de produción pode volver a apuntar á
versión anterior sen modificar o código de GitHub. A incidencia e o rollback
deben quedar rexistrados.
