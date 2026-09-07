# Guía técnica de deseño da web pública

## Finalidade

Este documento fixa as regras estruturais da versión pública da web da Sociedade Coral Polifónica de Pontevedra. O seu obxectivo é evitar que un cambio nunha páxina altere de novo o ancho, a escala ou a xerarquía visual do conxunto.

Estas regras non se aplican ao portal privado (`/portal/`).

## Principios visuais

1. Deseño minimalista, institucional e sobrio.
2. Predominio de rectángulos baixos fronte a bloques cadrados ou heroes de gran altura.
3. Granate, dourado, branco e tons neutros como paleta principal.
4. Ningún bloque debe ocupar a pantalla só para mostrar un título.
5. O menú lateral de **A Coral** é permanente en escritorio e despregable en tablet e móbil.
6. A portada é a única páxina pública sen menú lateral e conserva unha composición propia.

## Paridade galego–español

A web pública en galego e a web pública en español son dúas versións lingüísticas da mesma presenza institucional, non dous produtos independentes.

Regras obrigatorias de mantemento:

1. Todo cambio público de **contido, estrutura, navegación, imaxes, xerarquía visual ou comportamento** realizado nunha versión debe revisarse na súa ruta equivalente do outro idioma.
2. Se o cambio é aplicable aos dous idiomas, debe incorporarse ás dúas versións dentro do mesmo traballo ou PR. Non se considera rematada unha modificación pública se queda unha versión atrasada sen unha razón documentada.
3. As diferenzas entre idiomas deben limitarse á tradución, á adaptación lingüística ou a casos nos que exista unha razón funcional explícita.
4. Sempre que sexa razoable, debe preferirse unha **fonte de datos, estrutura ou compoñente compartido** con textos localizados fronte a manter dúas implementacións independentes.
5. Se aínda existen compoñentes paralelos, calquera cambio estrutural debe comprobar os dous membros da parella:
   - `src/layouts/Layout.astro` ↔ `src/layouts/SpanishPublicLayout.astro`
   - `src/components/PublicCoralMenu.astro` ↔ `src/components/SpanishCoralMenu.astro`
   - `src/components/PublicPageHero.astro` ↔ `src/components/SpanishPageHero.astro`
6. As rutas públicas equivalentes deben conservar os mesmos bloques funcionais e a mesma importancia relativa do contido, aínda que a redacción non sexa literalmente idéntica.
7. Esta regra de paridade non afecta ao portal privado (`/portal/`), que continúa coa súa arquitectura propia.

## Estrutura común

O layout xeral está en:

- `src/layouts/Layout.astro`

Os dous compoñentes públicos compartidos son:

- `src/components/PublicCoralMenu.astro`
- `src/components/PublicPageHero.astro`

A versión española mantén actualmente compoñentes equivalentes específicos. Mentres esa duplicidade exista, deben evolucionar en paralelo segundo a regra de paridade anterior.

Non se deben crear novos menús laterais nin novos heroes de páxina dentro dos ficheiros individuais. Se unha nova páxina necesita título, debe engadirse a súa información ao mapa `paxinas` de `PublicPageHero.astro` e á equivalencia española correspondente.

## Anchos de referencia

### Web pública con menú lateral

- Contedor exterior máximo: `1400px`.
- Menú lateral: entre `205px` e `225px`.
- Separación entre menú e contido: entre `1.2rem` e `1.8rem`.
- Marco común do título: máximo `900px`.

O marco pode ser máis estreito ca zona de contido. Non debe ampliarse ata encher todo o espazo dispoñible.

### Portada

- Contedor exterior máximo: `1240px`.
- Bloque principal granate máximo: `1120px`.
- Altura mínima en escritorio: `325px`.
- A portada non debe renderizar o menú lateral, nin sequera oculto mediante CSS.

## Cabeceira común das páxinas

A cabeceira común está en `PublicPageHero.astro` e ten a súa equivalencia na versión española.

Medidas de referencia:

- Ancho máximo: `900px`.
- Altura mínima: `168px`.
- Título máximo aproximado: `2.35rem`.
- Texto introdutorio: unha frase breve.
- Sen botóns, grellas ou navegación superposta.

A páxina Historia conserva a fotografía histórica como fondo. O resto usa un rectángulo granate común.

Os antigos encabezados incluídos nas páxinas individuais permanecen ocultos desde o compoñente común para evitar títulos duplicados. Non se deben volver activar salvo que se retire previamente a cabeceira común de toda a arquitectura.

## Páxina Historia

Os sete accesos ao arquivo histórico deben cumprir:

- Nunca usar marxe superior negativa.
- Nunca montar ou solapar a cabeceira.
- Ancho máximo: `900px`.
- Tres columnas en escritorio, dúas en tablet e unha en móbil estreito.
- Altura orientativa de cada rectángulo: `86px`.
- Mostrar só número, período e título.
- Non incluír descricións longas dentro dos botóns.

O contido interior de cada apartado —incluída Dirección musical— debe manter a mesma profundidade informativa e xerarquía visual en galego e español.

## Páxina A Coral

`/acoral` e `/es/la-coral` utilizan:

- O menú lateral público común ou a súa equivalencia lingüística.
- A cabeceira pública común co título correspondente.
- O contido propio da páxina sen o antigo menú interno duplicado.
- Os mesmos apartados institucionais, adaptados lingüisticamente.

## Comportamento adaptable

Punto principal de cambio: `1180px`.

Por debaixo desa medida:

- A estrutura pasa a unha columna.
- O menú lateral convértese nun botón despregable.
- O marco do título conserva marxes laterais de `1rem`.

En móbil non se deben recuperar alturas grandes para compensar a redución de ancho.

## Regras para futuras modificacións

Antes de modificar o deseño público:

1. Revisar `Layout.astro`, `PublicCoralMenu.astro` e `PublicPageHero.astro`, así como as súas equivalencias españolas cando o cambio poida afectalas.
2. Identificar a ruta equivalente no outro idioma antes de dar o cambio por rematado.
3. Non corrixir problemas xerais desde unha páxina individual.
4. Non usar `width: 100vw` nos contidos públicos.
5. Non introducir máximos superiores a `1400px` no layout público.
6. Non usar marxes negativas para montar tarxetas sobre unha cabeceira.
7. Non duplicar títulos ou menús.
8. Manter o portal privado fóra dos selectores públicos.

## Comprobación mínima despois de cada cambio

Revisar estas páxinas en escritorio e móbil, incluíndo sempre a súa equivalencia española cando exista:

- `/` ↔ `/es/`
- `/acoral` ↔ `/es/la-coral`
- `/historia` ↔ `/es/historia`
- `/axenda` ↔ `/es/agenda`
- `/actualidade` ↔ `/es/actualidad`
- `/distincions` ↔ `/es/distinciones`
- `/contacto` ↔ `/es/contacto`
- `/portal/` (só para comprobar que os estilos públicos non o afectan)

Comprobar especialmente:

- que a portada non teña menú lateral;
- que Historia non presente solapamentos;
- que todas as páxinas públicas teñan unha única cabeceira;
- que o menú lateral non apareza no portal privado;
- que ningún marco supere desproporcionadamente o ancho do encabezado;
- que unha mellora ou novo bloque público non exista só nun idioma sen xustificación.

## Decisión de arquitectura

A escala visual pública queda controlada polos compoñentes compartidos. Os estilos individuais de cada páxina deben limitarse ao seu contido específico e non redefinir a estrutura xeral, o menú lateral nin a cabeceira institucional.

Como obxectivo de evolución, a web pública debe reducir progresivamente as implementacións paralelas entre galego e español e mover estrutura e datos comúns a fontes compartidas con textos localizados. Isto diminúe o risco de que unha versión quede atrasada respecto da outra.
