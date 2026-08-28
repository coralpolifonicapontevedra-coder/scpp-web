# Administración de Ensaios v2

Data: 28/08/2026

## Motivo

O módulo administrativo anterior entrou nun bucle de autorización ao combinar `/api/ensaios-admin` e `/api/ensaios` con criterios e caches diferentes. A decisión é non seguir parcheando esa pantalla e reconstruír a capa administrativa tomando `Administración → Concertos` como patrón estable.

## Principio de deseño

- Non se toca produción.
- Non se substitúe aínda a ruta actual de Ensaios.
- A nova versión convive en paralelo ata superar as probas.
- A autorización administrativa usa exactamente o patrón de Concertos: Firebase + `persoas/cache/administracion/` en R2.
- Unha vez acreditada Administración, o endpoint le os datos de Ensaios sen volver interpretar `perfil.podeEditar` na capa Cloudflare.
- Apps Script segue sendo responsable das operacións reais sobre as Sheets.

## Ficheiros novos

- `functions/api/ensaios-admin-v2.js`
- `src/pages/portal/administracion/ensaios-v2.astro`

## Funcionalidade inicial

A primeira versión cobre:

- listar ensaios;
- filtrar activos / todos / baixa;
- alta de ensaio;
- cambiar data;
- dar de baixa;
- eliminar definitivamente con confirmación `ELIMINAR`;
- reconto de obras e asistencias;
- deseño responsive.

Esta primeira fase busca estabilizar autenticación, permisos e CRUD. A xestión musical (obras, asistentes, análise e finalización) incorporarase despois, reutilizando a arquitectura de borradores R2 que xa funciona no módulo de Ensaios.

## Endpoint v2

`/api/ensaios-admin-v2`

Fluxo:

1. valida Firebase;
2. verifica Administración coa mesma caché R2 que Concertos;
3. executa a acción de Ensaios en Apps Script;
4. invalida a caché de Ensaios tras escrituras.

## Ruta de proba

`/portal/administracion/ensaios-v2/`

A ruta actual `/portal/administracion/ensaios/` non se substitúe ata superar as probas.

## Criterio para substituír o módulo antigo

A v2 debe superar, sen erros intermedios:

1. abrir e mostrar nivel Administración;
2. listar os ensaios existentes;
3. crear un ensaio e velo inmediatamente;
4. recargar e seguir véndoo;
5. cambiar a data;
6. dar de baixa;
7. eliminar definitivamente;
8. funcionar en escritorio e móbil.

Despois engadiranse obras, asistentes, análise e finalización e só entón se cambiará a ruta oficial de Administración → Ensaios.
