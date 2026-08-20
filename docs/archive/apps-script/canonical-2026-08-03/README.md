# Copia canónica de Apps Script — 2026-08-03

## Finalidade

Este directorio conserva unha fotografía fiel do proxecto Apps Script que atende o Portal SCPP antes da futura modularización.

**Esta copia non é unha nova implementación e non debe despregarse automaticamente.** Primeiro debe compararse co proxecto publicado e superar probas de compatibilidade.

## Ficheiros completos recibidos desde o editor

| Ficheiro | Estado |
|---|---|
| `Codigo.gs` | Fonte actual confirmada |
| `persoas-administracion.gs` | Fonte actual confirmada |
| `documentacion-portal.gs` | Fonte actual confirmada |
| `fotos-r2.gs` | Fonte actual confirmada |
| `fotos-portal.gs` | Fonte actual confirmada |
| `perfil-portal.gs` | Fonte actual confirmada |

Recibiuse unha segunda copia de `documentacion-portal.gs` co mesmo SHA-256, polo que se considera duplicado exacto e non se gardou dúas veces.

## Módulos incorporados desde fragmentos completos da conversa

- `concertos-portal.gs`
- `solicitudes-web.gs`
- `asistencias-concertos.gs`
- `publicacions-web.gs`
- `sincronizar-medios-concertos-github.gs` — herdado
- `tests-e-migracions.gs`

Estes fragmentos foron convertidos en ficheiros independentes sen alterar a súa lóxica funcional. O seu `source` queda identificado no `manifest.json`.

## Probas e reparacións

`tests-e-migracions.gs` reúne funcións manuais, históricas ou potencialmente perigosas. Non forma parte do fluxo ordinario de produción e debe revisarse antes de executar calquera función.

Inclúe, entre outras:

- `corrixirUsuariosWebPortal`
- `comprobarAdministradorFotos`
- proba de integración de aceptación
- `diagnosticarAccesoMhm`
- `facerPublicasFotosDrive` — obsoleta; non executar

## Regras desta copia

1. Non cambiar nomes de funcións nin lóxica nesta fase.
2. Non eliminar compatibilidade con `Row ID` antes de comprobar dependencias.
3. Non mover IDs nin propiedades a un `CONFIG` común nesta copia.
4. Non retirar Drive/Base64 nesta copia.
5. Non substituír o proxecto publicado só porque estes ficheiros estean versionados.
6. Calquera depuración futura partirá dunha rama e dunha comparación contra esta fotografía.

## Estado

- Inventario funcional: **completado**.
- Manifesto e pegadas SHA-256: **completados**.
- Incorporación dos módulos funcionais identificados: **completada**.
- Comparación coa implementación publicada: **pendente**.
- Resolución de duplicacións globais: **pendente**.
