# Apps Script de producción — baseline 2026-08-30

Origen: `clasp clone` del proyecto real de producción.

- Archivo comprobado: `Código.js`
- Líneas: 2376
- SHA-256 producción actual: `8093abb6ef7dfdb27b0f46e2d5f471949fcdc3953da3524499051ddd8766c2e4`
- SHA-256 versión preparada con dispatcher de permisos: `c9680f63f1fc5fab14a674805f8c3f9d25eb8da2c2c165751c6b063d46518cd3`
- Líneas versión preparada: 2383

## Cambio autorizado para Accesos e permisos

Se añaden únicamente estas 7 líneas inmediatamente antes del bloque final que registra `Acción non permitida`:

```js
    const respostaPermisosAdmin =
      despacharXestionPermisosPortal_(accion, datos, bloqueo);

    if (respostaPermisosAdmin !== null) {
      return respostaJSON(respostaPermisosAdmin);
    }
```

No se sustituye `Código.js` por la versión de Preview y no se incorporan cambios de Persoas, Ensaios, Concertos, Fotos ni Sincronización.
