# Módulo Ensaios

Estado: primeira implementación xa integrada en produción e en ampliación funcional.

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

R2 non substitúe ás Sheets. Utilízase como índice privado e respaldo rápido de lectura.

## Permisos

- Xunta Directiva: lectura e escritura de ensaios, asistencias e repertorio traballado.
- Dirección: lectura e indicadores.
- Resto de usuarios: sen acceso ao módulo de xestión.

A autorización final das escrituras faise en Apps Script, non só na interface.

## API

Endpoint: `/api/ensaios`

Accións:

- `listarEnsaiosPortal`
- `gardarEnsaio`
- `gardarAsistenciaEnsaio`
- `gardarEnsaioRepertorio`
- `obterSeguimentoEnsaios`

O endpoint valida Firebase antes de acceder a datos privados.

## Caché e R2

Prefixo privado:

`ensaios/cache/usuarios/<sha256-email>.json`

Política:

- fresco: 10 minutos;
- respaldo máximo: 7 días;
- caché separada por usuario;
- respostas HTTP: `private, no-store`;
- nunca se escriben datos de asistencia en `R2_PUBLICO`;
- cada escritura confirmada en Sheet invalida o índice do usuario e intenta rexeneralo de inmediato.

Cabeceiras de diagnóstico:

- `X-SCPP-Cache`
- `X-SCPP-Storage`
- `Server-Timing`

A interface tamén mostra discretamente a fonte (`SHEET`, `R2-CACHE`, `R2-STALE`).

## Fluxo de escritura

1. navegador obtén token Firebase;
2. `/api/ensaios` valida identidade;
3. Apps Script comproba permisos;
4. Apps Script escribe na Sheet;
5. só despois dunha resposta correcta se invalida R2;
6. o endpoint tenta rexenerar o índice;
7. a interface confirma `Gardado`.

Nunca se considera definitiva unha modificación antes de confirmar a escritura en Sheet.

## Alta de ensaios

Os membros da Xunta Directiva con `podeEditar = true` dispoñen na cabeceira do módulo do botón `+ Novo ensaio`.

O formulario inicial permite gardar:

- data;
- hora de inicio;
- hora de fin;
- lugar;
- tipo de ensaio;
- descrición;
- observacións.

A escritura crea un `Id_Ensaio` mediante UUID, grava a fila na Sheet `Ensaios`, invalida a caché privada e tenta rexenerar inmediatamente o índice de R2.

## Apps Script

Ficheiros fonte no repositorio:

- `apps-script/ensaios-portal.gs`
- `apps-script/ensaios-alta.gs`

O despachador principal `doPost` debe incorporar estas correspondencias:

```text
listarEnsaiosPortal          -> listarEnsaiosPortal_(datos)
gardarEnsaioPortal           -> gardarEnsaioPortal_(datos)
gardarAsistenciaEnsaioPortal -> gardarAsistenciaEnsaioPortal_(datos)
gardarEnsaioRepertorioPortal -> gardarEnsaioRepertorioPortal_(datos)
obterSeguimentoEnsaiosPortal -> obterSeguimentoEnsaiosPortal_(datos)
```

`gardarEnsaioPortal`, `gardarAsistenciaEnsaioPortal` e `gardarEnsaioRepertorioPortal` deben considerarse accións de escritura se o dispatcher usa `ScriptLock`.

As propiedades opcionais son:

- `ENSAIOS_SPREADSHEET_ID`
- `ASISTENCIAS_ENSAIOS_SPREADSHEET_ID`
- `ENSAIOS_REPERTORIO_SPREADSHEET_ID`
- `PERSOAS_SPREADSHEET_ID`
- `CONCERTOS_SPREADSHEET_ID`
- `REPERTORIO_SPREADSHEET_ID`

Os ficheiros inclúen os IDs non secretos actuais como respaldo de configuración.

## Interface

Ruta estable: `/portal/ensaios/`.

Vistas:

1. Próximo ensaio.
2. Calendario.
3. Histórico.
4. Seguimento.

Dentro dun ensaio:

- asistencia por cordas ou todos;
- obras traballadas;
- tipo de traballo, desde/ata e observacións;
- acceso ao material de repertorio cando estea dispoñible.

## Seguimento

Filtros previstos:

- data inicial;
- data final;
- concerto;
- corda.

Indicadores iniciais:

- ensaios realizados;
- asistencia media;
- ausencias xustificadas;
- obras traballadas;
- asistencia por corda;
- número de ensaios por obra.

## Pendentes

1. incorporar `gardarEnsaioPortal` ao `doPost` de produción e despregar Apps Script;
2. probar a primeira alta real de ensaio desde o portal;
3. enriquecer as obras co índice R2 de `Repertorio` para abrir directamente audios por voz;
4. probar escrituras concorrentes de dous membros da Xunta;
5. probar móbil;
6. validar a actualización inmediata do índice R2 tras unha escritura.
