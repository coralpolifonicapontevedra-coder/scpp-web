# Google Apps Script SCPP

Este directorio contén o código fonte do proxecto principal de Apps Script.

- `src/`: fonte canónica descargada do proxecto de produción.
- `appsscript.json`: manifesto do web app, dentro de `src/`.
- Os ficheiros `.clasp.json` e `.clasprc.json` non se versionan.
- Probas e produción deben utilizar proxectos, propiedades e datos separados.

## Comprobación local

Desde a raíz do repositorio:

```sh
npm run check:apps-script
```

A comprobación valida a sintaxe de todos os ficheiros, o manifesto e que exista
un único despachador `doPost`.

## Regra de publicación

1. Cambio nunha rama.
2. Comprobación automática.
3. Sincronización co proxecto de probas.
4. Proba da URL de probas.
5. Aprobación manual.
6. Nova versión da implementación de produción.
