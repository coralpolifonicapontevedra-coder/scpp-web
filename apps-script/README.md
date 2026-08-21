# Google Apps Script SCPP

Este directorio contén o código fonte do proxecto principal de Apps Script.

- `src/`: fonte canónica compartida polos ambientes.
- `src/configuracion-entorno.js`: propiedades obrigatorias e bloqueo de escritura.
- `appsscript.json`: manifesto do web app, dentro de `src/`.
- Os ficheiros `.clasp.json` e `.clasprc.json` non se versionan.
- Probas e produción utilizan proxectos, propiedades e datos separados.
- O código non contén identificadores de Sheets/Drive nin correos reais.

## Comprobación local

```sh
npm run check:apps-script
```

A comprobación valida a sintaxe, o manifesto, o despachador `doPost`, a
configuración illada, os correos/IDs, as funcións globais duplicadas e que non
se usen o arquivo activo, procuras ambiguas en Drive nin IDs numéricos de folla.

## Protección de escritura

Todo ambiente debe declarar `SCPP_ENVIRONMENT` como `test` ou
`production`. As accións que modifican datos só se executan cando
`SCPP_ALLOW_WRITES=true`. O proxecto de probas comeza con ese valor en
`false`.

## Regra de publicación

1. Cambio nunha rama.
2. Comprobación automática.
3. Sincronización co proxecto de probas.
4. Configuración con copias de datos e escritura inicialmente desactivada.
5. Proba da URL de probas.
6. Aprobación manual.
7. Nova versión da implementación de produción.
