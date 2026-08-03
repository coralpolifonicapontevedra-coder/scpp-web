# Arquitectura xeral

## Compoñentes

- **Astro / Cloudflare Pages:** interface pública e portal privado.
- **Cloudflare Functions/Workers:** autenticación, caché, validación de solicitudes e entrega de ficheiros.
- **Firebase Authentication:** identificación dos usuarios do portal.
- **Apps Script:** permisos, regras de negocio e lectura/escritura de metadatos nas Sheets.
- **Google Sheets:** datos estruturados, relacións e metadatos.
- **Cloudflare R2:** ficheiros operativos servidos pola web.
- **Google Drive:** entrada, traballo e respaldo operativo; non debe ser a orixe directa das descargas web.
- **GitHub Actions:** migracións, sincronizacións, índices, auditorías e despregues.

## Fluxo privado de datos

```text
Navegador
  → Firebase Authentication
  → Cloudflare Worker
  → Apps Script
  → Google Sheets
  → resposta JSON
```

## Fluxo privado de ficheiros

```text
Navegador
  → Cloudflare Worker
  → Apps Script valida usuario, permiso e referencia
  → Apps Script devolve a clave R2
  → Worker le R2_PRIVADO
  → Worker entrega o ficheiro
```

Apps Script non debe abrir o ficheiro, convertelo a Base64 nin transportalo.

## Separación de responsabilidades

### Páxina Astro

- Presentación e interacción.
- Non contén secretos.
- Non decide permisos definitivos.
- Non accede directamente a Sheets, Drive ou R2 privado.

### Worker

- Valida o token de Firebase.
- Limita accións admitidas.
- Aplica tempos máximos e mensaxes de erro por etapas.
- Xestiona caché segura.
- Serve ficheiros desde R2.

### Apps Script

- Valida permisos funcionais.
- Le e actualiza metadatos.
- Devolve obxectos pequenos e previsibles.
- Non transporta binarios.

### Sheets

- Mantén IDs estables.
- Contén metadatos do ficheiro e estado de sincronización.
- Non utiliza o número de fila como identidade funcional.

### R2

- Mantén claves estables e nomes normalizados.
- Separa contido público e privado.
- É a orixe operativa de todo ficheiro mostrado ou descargado pola web.

## Patrón de módulos

Cada módulo novo ou renovado debe incluír:

1. Ruta oficial limpa.
2. Endpoint propio ou servizo común claramente versionado.
3. Autenticación e autorización.
4. Caché con caducidade coñecida.
5. Erros por etapas.
6. IDs estables.
7. Ficheiros en R2.
8. Proba en ruta temporal só durante a transición.
9. Retirada posterior de nomes como `novo`, `nova`, `v2`, `final` ou similares da interface pública.

## Rendemento

Para módulos pequenos e medianos:

- A interface debe aparecer inmediatamente.
- A lectura fría de metadatos debería completarse normalmente en 1–3 segundos.
- As lecturas desde caché deberían ser case inmediatas.
- O listado nunca debe incluír o contido binario dos ficheiros.
- As chamadas independentes deben executarse en paralelo cando sexa seguro.
