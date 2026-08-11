# Módulo Ensaios

Estado: integrado en produción e en ampliación funcional.

## Obxectivo

Centralizar planificación de ensaios, control de asistencia, repertorio traballado e indicadores para a Dirección e a Xunta Directiva.

## Fonte de verdade

As Google Sheets seguen sendo a fonte administrativa:

- `Ensaios`
- `AsistenciasEnsaios`
- `EnsaiosRepertorio`
- `Persoas`
- `Concertos`
- `Repertorio`

R2 non substitúe ás Sheets. Utilízase como índice privado, respaldo rápido de lectura e apoio para resolver o programa dos concertos.

## Permisos

- Xunta Directiva: lectura e escritura de ensaios, asistencias e repertorio traballado.
- Dirección: lectura e indicadores.
- Resto de usuarios: sen acceso ao módulo de xestión.

A autorización final das escrituras faise en Apps Script, non só na interface.

## API

Endpoint: `/api/ensaios`.

Accións:

- `listarEnsaiosPortal`
- `gardarEnsaio`
- `gardarAsistenciaEnsaio`
- `gardarEnsaioRepertorio`
- `incluírProgramaEnsaio`
- `obterSeguimentoEnsaios`

O endpoint valida Firebase antes de acceder a datos privados.

## Caché e R2

Prefixo privado actual:

`ensaios/cache-v2/usuarios/<sha256-email>.json`

Política:

- fresco: 10 minutos;
- respaldo máximo: 7 días;
- caché separada por usuario;
- respostas HTTP: `private, no-store`;
- nunca se escriben datos de asistencia en `R2_PUBLICO`;
- cada escritura confirmada en Sheet invalida o índice do usuario e intenta rexeneralo de inmediato.

O payload v2 incorpora tamén unha vista mínima dos concertos e dos seus programas obtida desde `indices/concertos-privado-v1.json` en `R2_PRIVADO`. Se o índice de concertos non está dispoñible, Ensaios segue funcionando sen esa ampliación.

Cabeceiras de diagnóstico:

- `X-SCPP-Cache`
- `X-SCPP-Storage`
- `Server-Timing`

A interface mostra discretamente a fonte (`SHEET`, `MEMORIA`, `R2-CACHE`, `R2-STALE`).

## Fluxo de escritura

1. navegador obtén token Firebase;
2. `/api/ensaios` valida identidade;
3. Apps Script comproba permisos;
4. Apps Script escribe na Sheet;
5. só despois dunha resposta correcta se invalida R2;
6. o endpoint tenta rexenerar o índice;
7. a interface confirma o resultado.

Nunca se considera definitiva unha modificación antes de confirmar a escritura en Sheet.

## Alta de ensaios

Os membros da Xunta Directiva con `podeEditar = true` dispoñen na cabeceira do módulo do botón `+ Novo ensaio`.

O formulario permite gardar data, horas, lugar, tipo de ensaio, concerto relacionado, descrición e observacións. A escritura crea `Id_Ensaio` mediante UUID, grava a fila na Sheet `Ensaios`, invalida a caché privada e tenta rexenerar inmediatamente o índice de R2.

## Asistencia

A interface non lista de entrada todos os coralistas. O bloque de asistencia ten cinco accesos:

- `Asistentes`: vista de consulta, con total xeral e nomes agrupados por Sopranos, Contraltos, Tenores e Baixos;
- `Sopranos`;
- `Contraltos`;
- `Tenores`;
- `Baixos`.

Ao entrar nunha corda aparecen unicamente os seus membros, ordenados alfabeticamente, para marcar `Asiste` ou `Non asiste`. O resumo mostra presentes e rexistros completados desa corda.

## Obras traballadas

Non se renderiza o repertorio completo, xa que pode superar centos de obras.

Hai dúas vías de alta:

- `Incluír desde programa`: usa o concerto vinculado ao ensaio e incorpora as obras do seu programa que teñen correspondencia con Repertorio;
- buscador por título ou compositor: selecciona unha obra concreta e engádea ao ensaio.

Debaixo só se listan as obras efectivamente asociadas a ese ensaio. O título de cada obra enlaza directamente a `/portal/repertorio/?id=<Id_Repertorio>`.

A inclusión desde programa reutiliza a acción existente `gardarEnsaioRepertorioPortal` de Apps Script e invalida/Rexenera a caché unha única vez ao rematar o lote.

## Presentación de campos

Premisa de deseño do módulo: os valores de campos diferentes nunca se concatenan visualmente sen separación. Nas cabeceiras e fichas úsanse separadores visibles (` · `, ` – `) ou bloques independentes. Exemplo: `Ordinario · Ensaio xeral`, nunca `OrdinarioEnsaio xeral`.

## Apps Script

A implementación activa debe despachar:

```text
listarEnsaiosPortal          -> listarEnsaiosPortal_(datos)
gardarEnsaioPortal           -> gardarEnsaioPortal_(datos)
gardarAsistenciaEnsaioPortal -> gardarAsistenciaEnsaioPortal_(datos)
gardarEnsaioRepertorioPortal -> gardarEnsaioRepertorioPortal_(datos)
obterSeguimentoEnsaiosPortal -> obterSeguimentoEnsaiosPortal_(datos)
```

`gardarEnsaioPortal`, `gardarAsistenciaEnsaioPortal` e `gardarEnsaioRepertorioPortal` son accións de escritura e deben usar o `ScriptLock` do dispatcher.

Propiedades opcionais:

- `ENSAIOS_SPREADSHEET_ID`
- `ASISTENCIAS_ENSAIOS_SPREADSHEET_ID`
- `ENSAIOS_REPERTORIO_SPREADSHEET_ID`
- `PERSOAS_SPREADSHEET_ID`
- `CONCERTOS_SPREADSHEET_ID`
- `REPERTORIO_SPREADSHEET_ID`

## Seguimento

Filtros: data inicial, data final, concerto e corda.

Indicadores iniciais: ensaios realizados, asistencia media, ausencias xustificadas, obras traballadas, asistencia por corda e número de ensaios por obra.

## Pendentes

1. probar en móbil a nova navegación por cordas;
2. comprobar con programas reais a resolución automática das obras desde o índice privado de concertos;
3. enriquecer máis adiante as obras cos audios do índice R2 de Repertorio;
4. probar escrituras concorrentes de dous membros da Xunta;
5. validar a actualización inmediata do índice R2 tras escrituras consecutivas.
