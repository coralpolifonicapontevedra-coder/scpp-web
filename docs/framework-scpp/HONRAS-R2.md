# Honras concedidas · índice R2

## Estado

Módulo público en incorporación seguindo o framework SCPP de rendemento.

## Fonte de administración

- Google Sheet: `Honras`.
- A Sheet conserva os datos estruturados e é a fonte funcional de edición.
- Campos publicados: `Id_Honra`, `Categoria`, `Data`, `Ano`, `Festividade`, `PersoaEntidade`, `TipoDestinatario`, `Condicion`, `Observacions`, `MostrarWeb` e `Orde`.
- Só se publican rexistros con `MostrarWeb = TRUE`.

## Índice operativo

```text
scpp-publico/indices/honras-v1.json
```

O índice contén os datos xa normalizados para lectura web. A páxina pública non consulta Google Sheets nin Apps Script en tempo real.

## Fluxo

```text
AppSheet / Sheet Honras
        ↓ sincronización con conta de servizo
scripts/sync-honras-r2.py
        ↓ validación
scpp-publico/indices/honras-v1.json
        ↓
functions/api/honras.js
        ↓
/honras
```

## Regras de seguridade e estabilidade

1. `Id_Honra` é a identidade estable; nunca se utiliza `_RowNumber`.
2. Un fallo de Google, de validación ou de R2 non elimina nin substitúe o último índice válido.
3. O índice é independente dos demais módulos.
4. A API pública le exclusivamente R2.
5. O navegador recibe só os campos necesarios para presentar a relación.
6. A caché pública do índice é de 300 segundos, compatible co patrón xeral do proxecto.

## Categorías actuais

- Placa de San David.
- Medalla de Ouro e Brillantes.
- Medalla de Ouro.
- Medalla de Prata.

## Presentación web

Ruta: `/honras`.

A cabeceira pública usa `Honras concedidas` como título principal e `Distincións concedidas` como subtítulo. Evítanse referencias técnicas ao índice R2 na interface pública.

A páxina presenta catro categorías e, dentro de cada unha, agrupa os rexistros por ano. En escritorio utiliza unha táboa ampla, aproveitando case todo o ancho útil da páxina, coas columnas `Data`, `Persoa / entidade`, `Condición`, `Festividade` e `Observacións`. En móbil a mesma táboa transfórmase en fichas verticais, mantendo visibles as etiquetas de cada campo e evitando o desprazamento horizontal.

## Menú institucional

Para evitar ambigüidades, o menú público distingue:

- `Distincións recibidas`: recoñecementos concedidos á SCPP.
- `Honras concedidas`: recoñecementos concedidos pola SCPP.

A URL histórica `/distincions` consérvase.

## Sincronización

O normalizador está en `scripts/sync-honras-r2.py` e a súa proba en `tests/test_sync_honras_r2.py`.

O workflow `sync-honras-r2.yml` utiliza a conta de servizo de Google xa configurada no environment `r2-migration` para ler a Sheet `Honras` e publicar o índice en `scpp-publico`. Os valores secretos non se almacenan no repositorio.

A primeira sincronización foi validada correctamente mediante GitHub Actions. O módulo mantén a última copia válida de R2 se Google, a validación ou a publicación fallan.

## Preview de Cloudflare

Para probar `/honras` nun Branch Preview, o ambiente Preview de Cloudflare debe ter dispoñible o binding:

- `R2_PUBLICO` → bucket público `scpp-publico`.

`R2_PRIVADO` non é necesario para a lectura de Honras, aínda que pode existir por coherencia co resto do proxecto. O endpoint `/api/r2-status` permite comprobar se os bindings están configurados e accesibles no ambiente activo.
