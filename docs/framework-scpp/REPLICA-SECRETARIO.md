# Réplica institucional en `secretario@coralpolifonicapontevedra.org`

Estado preparado o 18-09-2026. Este documento non autoriza nin executa cambios en
Produción. A web publicada, o dominio, Pages e os buckets R2 permanecen intactos.

## Obxectivo

Crear unha réplica da plataforma que use as follas e carpetas propiedade da conta
institucional, conservando inicialmente Pages, Workers e R2 na conta Cloudflare
actual, á que `secretario@coralpolifonicapontevedra.org` xa accede como Super Admin.

O fluxo da réplica será:

```text
Sheets de Secretario -> Apps Script da réplica -> índices de proba en R2
                    -> Pages/Functions da réplica -> navegador
```

## Inventario confirmado

- Carpeta de orixe: `1qmwyAmA9LJJ04FfTSuXgANFveOAUFaBv`.
- Carpeta institucional: `1mgbmODkkyKZEjTaDRH7UsjUtZm2PpaNZ`.
- Apps Script institucional existente: `SCPP Script`, propiedade de Secretario,
  con ID `1-N0TM80zj_kNroktqXTjPqLVH3dmFruiKHq4H3VhnaWHxK5FIun2qL7k`.
- As copias institucionais non están compartidas e foron creadas o 17-09-2026.
- Nas follas críticas comprobadas consérvanse nomes de pestana, `sheetId`, número
  de filas e número de columnas: UsuariosWeb, Persoas, Repertorio,
  AudiosRepertorio, Partituras e Fotos.
- `AudiosRepertorio` válido para a réplica é `108IkK_MPNqwMtkP7Qz4pqbzkTY6JBwYkI_9Npt1ik1U`.
  As dúas copias co sufixo `anterior 2026-09-17` son respaldo e non deben usarse.
- O 18-09-2026 gardáronse no Apps Script institucional 34 propiedades non secretas
  co mapa de Sheets e carpetas. `SCPP_ENVIRONMENT=preview`,
  `GITHUB_BRANCH=preview` e `PERSOAS_ALLOW_EMAIL_SEND=false` manteñen a réplica
  separada e sen envíos de correo.
- Non se copiaron `WEB_WRITE_TOKEN`, `GITHUB_TOKEN` nin outros segredos; tampouco
  se creou deployment nin se modificou Pages/R2.

## Mapa de recursos

| Recurso | ID antigo | ID institucional |
|---|---|---|
| RexistroAccesosWeb | `1nhoP8ea1RyZiZ9SaTyFjnHG9MBOk-TMe15eHvvkXcdU` | `16sAHStRwNzNAROV7X0pXYu-GBHwzZoGEnzSFCz9nbCY` |
| UsuariosWeb | `1qbW0q1Z6U3JnW0yGM4ELUWqjRkyNdJckJx0VGSoK-i8` | `1anry8OEiJ5EuZ-LZtz0QM_13uHj3wn2KXnamXs7f8KI` |
| Persoas | `13-WeSz69A50XxPP57HA64Nascx6kXQFbeVKron0wATQ` | `1XWgPYg4z410225Qu17REOiXQlb14Wit7GwoWCjlo9rQ` |
| Repertorio | `1Hg_ZWsC6a7Sj-OCwRGyywzTJqqsIxUsAshk02yE9Enw` | `1xMsQhlY-M_K7h65T0de0ENySv1SxNrmPLjLoMGEIM2Y` |
| AudiosRepertorio | `16BNPPni5BxowBsdGcvATj-zhYNLJYwjWoy2Zqtdu6i0` | `108IkK_MPNqwMtkP7Qz4pqbzkTY6JBwYkI_9Npt1ik1U` |
| Partituras | `18KCxQC7UnplDjPoAq2w4EgD8vGZ5G2JDAKvuXIewet0` | `1r15Q9RJ-TH6NLFCIAiEI6qUeU5Ax82BF__bur0LoGHc` |
| Fotos | `1NhWEnrlOk285ECxUQMB3Pedd28TNkiMmN-K25vzd_2w` | `1KuSQDBk1-7WfDtO7nxKGQGTVggpwdI3kRzPSuKlMQrg` |
| Concertos | `1vYlC1VO1hql8jJVkt1OBXnbH7GvUVe4XXe5TSIJk2dU` | `16v71m2HVzygUpOqn-Zws59d2jmaSqzcbq866pLZeQyA` |
| ConcertosRepertorio | `1NyOt3A8EQ-HFBguDlsqaBQ0TpdlslI0GkRQzGXZkOig` | `12XfmhPTQCgOdIXN5Qg76Ej_cwgfh0LelNq9lhuLdDtg` |
| AsistenciasConcertos | `1pObayoj3uoPLtqUqQG9S5GZ0afRz9ErBeJbTgJlaiH0` | `199NFDBqbDT_9PXcB4roZK9dvyTWmnTsQXS8ZJMlE-qY` |
| Ensaios | `1YJkIH4DpuOQShAP8fcSq_TrLPDn08zv_tfKNjq297wc` | `1C7EJINpYuhjOsn9ZtUM6HAUBww47BeY4sD_gszNjbug` |
| EnsaiosRepertorio | `155FLEl07h8LwlrSVLEhFsbkgJMqIf4E6k6lCXf8x_JE` | `1qp3oKzWColruFIHLSHTaeLCNFk3ebQQ8zGu5wa11eUg` |
| AsistenciasEnsaios | `1yp0Gc_GaewODS6IaPB9p2cdKqeOCbnyehL_-HzpdUQI` | `1SML9gTtVKzACxY4G8evp7wlfO7fZ8ut2fMOkKxvRxqI` |
| Aceptacion | `1gndQQ1AFQLtg2lUU8ANa5ksU3U6wZNxJI2Ye6z7Mu7k` | `1tFlpbljN_eYKWm1QON8hwPZU1v4rB3C3ebafe8lIiXs` |
| Actas XD e AX | `1sAMi9TWZ7YwjOxu1a-KliO_7LtYlo4Zf2AowmPKDQX8` | `10FWjnP5q79gjPHjOc4MRpLHaDFo46iIXSItqsHOpjjs` |
| Publicacións | `1UjEvc2x6n2zmpXp6bgATTwAORbKPmI2zePdMTB5kmVU` | `1M5tafOg_b3L-TiBH8UnA1rMwEiXmjiCBqvGRV3Bk2Uo` |
| Honras | `1YUJ-110A2A8EASTblPE8YSJuRUTKgmKIFGPRaOVhCAE` | `1T9RFmj8kW-jfaC7id9bnOE2F14MSQq9AFJB2gAAVecw` |
| SolicitudesWeb | `1qWzgh84n6yI3mNt1OSWQiytOy1qt3NrLYb3cjQmYuDE` | `1GxQkT4Av2cfWp2UetfMVCvYI0_9PYUnxYLkschwH6wo` |
| Colaboracións | `1mqlMESC6ZkE4t1zfA0q1dK3PRFHtKLO71ifdbT2CtHw` | `1TSniMR9gurDZ7M_ciL2rWvXVnX3wriFz20AdRPCf_a0` |
| XuntaDirectiva | `1zRKw66yA5zn1fmR4tlgZRtNZ4Gg5ezrDiF8oHzpUykc` | `1ZwpZ9msqB5PFsIaJp_2pkqhCsbheniR07l0pZt_xSu8` |
| DireccionArtistica | `1X1wu0n2Mz-LKZzCDUp--P1V2GY5tIZztz7EwoXOfQII` | `1OoaU1mUJ8bCxd2YzQNbDYbP2-b254terghcXtodSCTs` |

## Orde de execución segura

1. Crear un proxecto Apps Script independente baixo Secretario; non modificar o
   deployment de Produción.
2. Partir do código vivo de Produción, segundo
   `apps-script-production-promotion.md`, e aplicar nel unicamente a configuración
   da réplica.
3. Configurar as Script Properties cos IDs institucionais. Substituír tamén os IDs
   antigos que aínda están codificados directamente en ficheiros `.gs` e scripts.
4. Usar prefixos ou rutas R2 exclusivos de proba. A réplica non debe escribir nos
   índices canónicos de Produción durante a validación.
5. Crear un proxecto Pages de réplica na conta Cloudflare actual e asignarlle os
   bindings/segredos correspondentes. Non asociar aínda o dominio principal.
6. Validar lectura, escritura e regresión por módulos. Comparar reconto, esquema e
   claves funcionais entre cada folla antiga e institucional.
7. Só despois da validación decidir o cambio de dominio e manter rollback.

## Bloqueos detectados antes de despregar

- Hai scripts con IDs de Produción codificados directamente, ademais das Script
  Properties. Deben parametrizarse para a réplica; non basta con cambiar variables
  en Cloudflare.
- As follas antigas continuaron recibindo cambios despois de crear algunhas copias
  institucionais. Antes da posta en marcha será necesaria unha sincronización final
  controlada para evitar perda de cambios.
- Falta crear o Apps Script independente da réplica e obter a súa URL de deployment.
- Falta inventariar os segredos e bindings efectivos do Pages vivo antes de crear
  el proxecto de réplica.

## AppSheet

Non é requisito para esta fase. Poderase crear ou transferir máis adiante unha app
propiedade de Secretario que use estas mesmas follas, sen cambiar Pages nin R2.
