# Índices de concertos en R2

## Obxectivo

A axenda pública non consulta Google Sheets durante a navegación. Unha tarefa
programada le as follas publicadas, valida os datos e deixa en R2 o último
índice correcto. Deste xeito, unha caída temporal de Google ou unha fila mal
formada non interrompe a web.

## Fluxo

1. AppSheet administra as follas `Concertos`, `ConcertosRepertorio` e
   `Repertorio`.
2. GitHub Actions executa `scripts/sync-concertos-r2.py` cada 15 minutos e
   tamén admite execución manual.
3. O script descarga as tres fontes, relaciona o programa de cada concerto e
   comproba a súa coherencia antes de escribir nada.
4. Cloudflare Pages Functions serven a axenda desde `/api/concertos-indice`
   e o arquivo público desde `/api/concertos-historico`.
5. `src/pages/axenda.astro` le o índice reducido da axenda e
   `src/pages/historico-concertos.astro` le a vista histórica saneada.

## Índices

| Ámbito | Bucket e clave | Contido |
| --- | --- | --- |
| Axenda pública | `scpp-publico/indices/concertos-v1.json` | Só filas con `Mostrar_Web=TRUE` |
| Histórico público | `scpp-publico/indices/concertos-historico-v1.json` | Número, orde, data, nome, lugar, cidade e descrición |
| Privado | `scpp-privado/indices/concertos-privado-v1.json` | Todas as filas, programa e numeración histórica |

O índice histórico público é unha proxección deliberadamente mínima: non inclúe
programas, rutas de documentos, bandeiras internas nin asistencia. O índice
privado non dispón de endpoint público. Os documentos e audios dos
concertos conservan as súas rutas R2 actuais; esta sincronización só crea
índices JSON.

## Identidade e orde histórica

- `Id` segue sendo a clave técnica estable para AppSheet, relacións e medios.
- `NumeroConcerto` é a numeración visible do arquivo histórico e admite valores
  de texto como `61/b` ou `191b`.
- `OrdeHistorica` é un enteiro independente, consecutivo desde 1, usado para
  ordenar e validar a serie.
- `DataTextoHistorica` conserva datas imprecisas cando non existe un día exacto.

Non se debe substituír `Id` por `NumeroConcerto` nin renomear claves de medios
R2 ao editar a numeración histórica.

## Proteccións

Antes de publicar, a sincronización esixe:

- cabeceiras obrigatorias presentes;
- `Id` e `NumeroConcerto` sen duplicados;
- `OrdeHistorica` completa e correlativa;
- número e orde histórica sempre emparellados;
- texto histórico para os rexistros sen data exacta;
- data e nome en todos os rexistros visibles na web;
- polo menos un rexistro con `Mostrar_Web=TRUE`.

Se Google non responde ou falla calquera comprobación, o workflow remata con
erro e o último índice válido de R2 permanece intacto. Se os datos non
cambiaron, tampouco reescribe os obxectos.

## Operación

Workflow: `.github/workflows/sync-concertos-r2.yml`.

Para unha actualización urxente, executar manualmente **Sincronizar concertos
con R2** en GitHub Actions. A actualización normal pode tardar ata 15 minutos
máis a caché de cinco minutos do endpoint público.

As páxinas privadas conservan a consulta directa á folla para as funcións de
xestión. A grella principal só amosa as filas con `Mostrar_Web=TRUE`; o
arquivo completo aparece nunha vista histórica independente e non crea centos
de tarxetas na vista inicial.

Unha resposta correcta de `/api/concertos-indice` inclúe:

- `ok: true`;
- `cache: "R2"`;
- cabeceira `X-SCPP-Concertos-Index: R2`;
- `xeradoEn` e `xeradoEnMs` para identificar a versión.


O endpoint `/api/concertos-historico` aplica a mesma política de caché e
identifícase coa cabeceira `X-SCPP-Concertos-Historico: R2`.
