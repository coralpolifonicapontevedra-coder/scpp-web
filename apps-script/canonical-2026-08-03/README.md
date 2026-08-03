# Copia canónica de Apps Script — 2026-08-03

## Finalidade

Este directorio conserva unha fotografía fiel do proxecto Apps Script que atende o Portal SCPP antes da futura modularización.

**Esta copia non é unha nova implementación e non debe despregarse automaticamente.** Primeiro debe compararse co proxecto publicado e superar probas de compatibilidade.

## Fontes confirmadas

Os seguintes ficheiros foron entregados directamente desde o editor de Apps Script e quedaron identificados mediante SHA-256:

| Ficheiro canónico previsto | Liñas | SHA-256 | Estado |
|---|---:|---|---|
| `Codigo.gs` | 1.988 | `b9e9eb23491ee5b35bb79f9cf4ebb5c9b8b495a2f5027fca93d2881fb20ba83a` | Fonte actual confirmada |
| `persoas-administracion.gs` | 768 | `c7cdcbf156a2b4b877c64a5ee73c56c93bdaef38a6541d8d8dc633b93c33c4d6` | Fonte actual confirmada |
| `documentacion-portal.gs` | 799 | `35378134484ed4146832a3562fb6929004643400d0410ff4a05be13e649f4c23` | Fonte actual confirmada |
| `fotos-r2.gs` | 585 | `5808b2907a67cce7a00c1560b84ef9b5f0edbec51a8db1af8b39bb002ae0ebe2` | Fonte actual confirmada |
| `fotos-portal.gs` | 892 | `ed0542814cd09178b5fb0ec216cddf8080cc6fd0cad9e48ae12f3a542d806c07` | Fonte actual confirmada |
| `perfil-portal.gs` | 900 | `7aa850a9398a56a0a6a55ab332211b41f039560373ec405278a911a8b00d0e8b` | Fonte actual confirmada |

Recibiuse unha segunda copia de `documentacion-portal.gs` co mesmo SHA-256 (`353781...c4c23`), polo que se considera duplicado exacto e non se gardará dúas veces.

## Módulos entregados como fragmentos completos no inventario

Tamén están identificados e deben incorporarse como ficheiros independentes na copia canónica:

- `concertos-portal.gs`
- `solicitudes-web.gs`
- `asistencias-concertos.gs`
- `publicacions-web.gs`
- `sincronizar-medios-concertos-github.gs` — herdado
- `tests-e-migracions.gs`

## Funcións de proba e reparación clasificadas

Deben quedar en `tests-e-migracions.gs`, separadas do código operativo:

- `probarEscrituraAceptacion`
- versión herdada de `obterUsuarioWebPorEmail` — duplicación crítica que non debe quedar activa
- `corrixirUsuariosWebPortal`
- `comprobarAdministradorFotos`
- `probarPostAceptacion`
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

- Inventario funcional: completado.
- Manifesto e pegadas SHA-256: completados.
- Incorporación íntegra dos ficheiros fonte ao directorio canónico: en curso.
- Comparación coa implementación publicada: pendente.
