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
        ↓ sincronización
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

A páxina presenta catro categorías e, dentro de cada unha, agrupa os rexistros por ano. En escritorio utiliza unha relación tabular e en móbil cada rexistro pasa a unha disposición vertical para evitar desprazamento horizontal.

## Menú institucional

Para evitar ambigüidades, o menú público distingue:

- `Distincións recibidas`: recoñecementos concedidos á SCPP.
- `Honras concedidas`: recoñecementos concedidos pola SCPP.

A URL histórica `/distincions` consérvase.

## Sincronización

O normalizador está en `scripts/sync-honras-r2.py` e a súa proba en `tests/test_sync_honras_r2.py`.

O workflow `sync-honras-r2.yml` queda inicialmente en execución manual ata conectar unha fonte CSV accesible por GitHub Actions mediante `HONRAS_CSV_URL`. Non se activa unha programación periódica mentres esa fonte non estea verificada, para evitar falsos erros e manter intacto o último índice válido.

Unha vez verificada a fonte, o workflow debe seguir o mesmo patrón periódico que os demais índices públicos e rexenerar só este módulo.
