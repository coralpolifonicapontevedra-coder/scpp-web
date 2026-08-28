# Administración de Ensaios v2

Data: 28/08/2026

## Motivo

O módulo administrativo anterior entrou nun bucle de autorización ao combinar `/api/ensaios-admin` e `/api/ensaios` con criterios e caches diferentes. A decisión foi non seguir parcheando esa pantalla e reconstruír a capa administrativa tomando `Administración → Concertos` como patrón estable.

## Principio de deseño

- Non se toca produción.
- Non se substitúe aínda a ruta antiga de Ensaios.
- A nova versión convive en paralelo ata superar as probas.
- A autorización administrativa usa o patrón de Concertos: Firebase + `persoas/cache/administracion/` en R2.
- Unha vez acreditada Administración, Cloudflare non volve reinterpretar `perfil.podeEditar`.
- Apps Script segue sendo responsable das operacións reais sobre as Sheets.
- R2 utilízase como caché de lectura para reducir esperas, nunca como fonte de verdade das escrituras.

## Ficheiros da v2

- `functions/api/ensaios-admin-v2.js`
- `functions/api/ensaios-admin-v2-xestion.js`
- `functions/api/ensaios-analise-v2.js`
- `src/pages/portal/administracion/ensaios-v2.astro`
- `src/pages/portal/administracion/ensaios-analise-v2.astro`

## Estrutura funcional acordada

### Pantalla principal

Na cabeceira da xestión aparecen dúas accións globais:

- `Alta de ensaio`
- `Análise de asistencia`

Cada ensaio ofrece:

- `Xestionar`
- `Cambiar data`
- `Dar de baixa`
- `Eliminar`

### Xestionar

O diálogo `Xestionar` queda reservado ao traballo operativo do ensaio e contén só:

1. `Asistencia`
2. `Obras`

`Análise` non pertence a un ensaio concreto: é unha ferramenta transversal sobre varios ensaios e vive nunha páxina independente.

### Asistencia

- coralistas agrupados por Soprano, Contralto, Tenor e Baixo;
- estados `Asiste`, `Non asiste` e `Non asiste con xustificación`;
- campo obrigatorio de xustificación cando corresponde;
- gardado na táboa `AsistenciasEnsaios` mediante `gardarAsistenciaEnsaioPortal`.

### Obras

A pestaña permite dúas vías:

- `Engadir desde Repertorio`: selector do repertorio xeral e alta mediante `gardarEnsaioRepertorioPortal`;
- `Cargar programa do concerto`: selección dun concerto e copia das obras do seu programa ao ensaio.

As obras xa vinculadas móstranse ordenadas na mesma pantalla.

### Análise de asistencia

Ruta:

`/portal/administracion/ensaios-analise-v2/`

É unha páxina independente accesible desde o botón `Análise de asistencia`, situado xunto a `Alta de ensaio` na pantalla principal.

Filtros combinables:

- `Data inicial`;
- `Data final`;
- `Corda`;
- `Coralista`;
- `Tipo de ensaio`;
- `Concerto relacionado`.

Inclúe tamén `Limpar filtros` para recuperar a vista xeral do ano en curso.

A análise calcula:

- número de ensaios do período e filtros seleccionados;
- número de persoas incluídas no filtro;
- asistencia media global;
- ausencias xustificadas e sen xustificar;
- asistencia por corda;
- dez coralistas con maior asistencia;
- dez coralistas con menor asistencia;
- detalle individual con porcentaxe, presentes, ausencias e xustificacións;
- evolución mensual;
- asistencia por ensaio;
- ensaio con maior e menor porcentaxe de asistencia.

Os porcentaxes individuais calcúlanse sobre rexistros de asistencia efectivamente decididos (`Asiste` / `Non asiste`), para non tratar como falta un rexistro aínda non cuberto.

## Rendemento

Detectouse que a primeira implementación relía o paquete completo de Ensaios desde Apps Script en cada carga e cada apertura de `Xestionar`.

A v2 incorpora agora:

- caché R2 da listaxe administrativa durante 5 minutos;
- caché R2 do paquete base de persoas, asistencias, repertorio e relacións durante 10 minutos;
- caché R2 dos programas de concertos durante 10 minutos;
- carga diferida de `Obras`: repertorio e programas só se solicitan cando se entra nesa pestaña;
- actualización/invalidez da caché tras escrituras para evitar datos obsoletos.

## Endpoint principal

`/api/ensaios-admin-v2`

Fluxo:

1. valida Firebase;
2. verifica Administración coa mesma caché R2 que Concertos;
3. serve a listaxe desde R2 cando é válida;
4. se non hai caché, executa `listarEnsaiosPortal` e rexenera R2;
5. invalida as cachés afectadas tras altas, cambios, baixas ou eliminacións.

## Endpoint de xestión

`/api/ensaios-admin-v2-xestion`

Accións actuais:

- `obterXestion`
- `gardarAsistencias`
- `obterObras`
- `gardarObra`
- `importarPrograma`

## Endpoint de análise

`/api/ensaios-analise-v2`

Usa a mesma autorización administrativa e o mesmo paquete base cacheado para calcular os resultados por rango de datas e os filtros opcionais de voz, persoa, tipo de ensaio e concerto.

## Ruta de proba

`/portal/administracion/ensaios-v2/`

A ruta antiga `/portal/administracion/ensaios/` non se substitúe ata superar as probas.

## Criterio para substituír o módulo antigo

A v2 debe superar, sen erros intermedios:

1. abrir e mostrar nivel Administración;
2. listar os ensaios existentes;
3. crear un ensaio e velo inmediatamente;
4. recargar e seguir véndoo;
5. cambiar a data;
6. dar de baixa;
7. eliminar definitivamente;
8. abrir `Xestionar` e cargar asistencia con rapidez;
9. gardar asistencia e manter os estados tras recargar;
10. engadir unha obra desde Repertorio;
11. cargar o programa dun concerto;
12. abrir a Análise e combinar data, corda, coralista, tipo e concerto;
13. funcionar correctamente en escritorio e móbil.

Só despois se cambiará a ruta oficial de Administración → Ensaios e se retirará a versión antiga.
