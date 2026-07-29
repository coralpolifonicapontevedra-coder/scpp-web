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

## Estrutura común

O layout xeral está en:

- `src/layouts/Layout.astro`

Os dous compoñentes públicos compartidos son:

- `src/components/PublicCoralMenu.astro`
- `src/components/PublicPageHero.astro`

Non se deben crear novos menús laterais nin novos heroes de páxina dentro dos ficheiros individuais. Se unha nova páxina necesita título, debe engadirse a súa información ao mapa `paxinas` de `PublicPageHero.astro`.

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

A cabeceira común está en `PublicPageHero.astro`.

Medidas de referencia:

- Ancho máximo: `900px`.
- Altura mínima: `168px`.
- Título máximo aproximado: `2.35rem`.
- Texto introdutorio: unha frase breve.
- Sen botóns, grellas ou navegación superposta.

A páxina Historia conserva a fotografía histórica como fondo. O resto usa un rectángulo granate común.

Os antigos encabezados incluídos nas páxinas individuais permanecen ocultos desde o compoñente común para evitar títulos duplicados. Non se deben volver activar salvo que se retire previamente a cabeceira común de toda a arquitectura.

## Páxina Historia

Os seis accesos ao arquivo histórico deben cumprir:

- Nunca usar marxe superior negativa.
- Nunca montar ou solapar a cabeceira.
- Ancho máximo: `900px`.
- Tres columnas en escritorio, dúas en tablet e unha en móbil estreito.
- Altura orientativa de cada rectángulo: `86px`.
- Mostrar só número, período e título.
- Non incluír descricións longas dentro dos botóns.

## Páxina A Coral

`/acoral` utiliza:

- O menú lateral público común.
- A cabeceira pública común co título **A Coral**.
- O contido propio da páxina sen o antigo menú interno duplicado.

## Comportamento adaptable

Punto principal de cambio: `1180px`.

Por debaixo desa medida:

- A estrutura pasa a unha columna.
- O menú lateral convértese nun botón despregable.
- O marco do título conserva marxes laterais de `1rem`.

En móbil non se deben recuperar alturas grandes para compensar a redución de ancho.

## Regras para futuras modificacións

Antes de modificar o deseño público:

1. Revisar `Layout.astro`, `PublicCoralMenu.astro` e `PublicPageHero.astro`.
2. Non corrixir problemas xerais desde unha páxina individual.
3. Non usar `width: 100vw` nos contidos públicos.
4. Non introducir máximos superiores a `1400px` no layout público.
5. Non usar marxes negativas para montar tarxetas sobre unha cabeceira.
6. Non duplicar títulos ou menús.
7. Manter o portal privado fóra dos selectores públicos.

## Comprobación mínima despois de cada cambio

Revisar estas páxinas en escritorio e móbil:

- `/`
- `/acoral`
- `/historia`
- `/axenda`
- `/actualidade`
- `/distincions`
- `/contacto`
- `/portal/`

Comprobar especialmente:

- que a portada non teña menú lateral;
- que Historia non presente solapamentos;
- que todas as páxinas públicas teñan unha única cabeceira;
- que o menú lateral non apareza no portal privado;
- que ningún marco supere desproporcionadamente o ancho do encabezado.

## Decisión de arquitectura

A escala visual pública queda controlada polos compoñentes compartidos. Los estilos individuales de cada página deben limitarse ao seu contenido específico y no redefinir la estructura general, el menú lateral o la cabecera institucional.
