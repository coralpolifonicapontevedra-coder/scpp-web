# STABILITY REVIEW — publicación 11/09/2026

> Documento reconstruido a partir del registro de ejecución de Codex y de la comprobación posterior del commit publicado en GitHub.
> No es el archivo local original de Codex, que no llegó a subirse al repositorio.

## 1. Estado de la publicación

**Repositorio:** `coralpolifonicapontevedra-coder/scpp-web`  
**Rama:** `main`  
**Commit publicado:** `d636a23afa0a180975be33da0bdbc13d0dcfaf2f`  
**Mensaje:** `Reducir saltos del portal y mejorar respuesta de formularios`  
**Commit base incorporado:** `d0658609a568566495ac8b6d408a2f93557d31c3`

La publicación se realizó después de incorporar los commits que habían entrado desde la primera revisión, incluido el cambio del correo público a `secretaria@coralpolifonicapontevedra.org` y el cambio de denominación a «Portal do coralista».

Según el registro de Codex, Cloudflare completó correctamente el despliegue.

**Despliegue de Cloudflare indicado por Codex:**  
`2cf07ed9-cc7b-4d72-81a5-4fd48f513983` — `success`

**Despliegue anterior indicado para rollback:**  
`3596ba29-c576-4668-a465-d814ea7a4eb0`

**Rollback previsto:** revertir únicamente el commit `d636a23`.

---

## 2. Archivos modificados en esta corrección

La publicación afectó únicamente a estos nueve archivos:

1. `public/css/agenda-mobile.css`
2. `public/css/portal-home.css`
3. `public/js/portal-auth-diagnostics.js`
4. `public/js/poster-thumbnails.js`
5. `src/components/Header.astro`
6. `src/layouts/Layout.astro`
7. `src/pages/axenda.astro`
8. `src/pages/portal.astro`
9. `src/pages/revision-datos.astro`

No se modificaron dependencias del proyecto en este commit.

---

## 3. Objetivo de los cambios

### Portal do coralista

Se trasladó parte del comportamiento visual que dependía de JavaScript a CSS cargado desde el inicio de la página.

Objetivos:

- reducir saltos visuales durante la carga;
- evitar que el navegador tenga que recolocar elementos después de ejecutar JavaScript;
- mejorar la estabilidad del formulario de acceso;
- mantener el diseño adaptativo en pantallas estrechas;
- conservar el título actual «Portal do coralista».

El nuevo archivo `public/css/portal-home.css` contiene el diseño responsivo que antes se introducía dinámicamente desde `portal-auth-diagnostics.js`.

### Axenda

Se trasladaron al nuevo archivo `public/css/agenda-mobile.css` las reglas de presentación móvil que antes se inyectaban mediante JavaScript.

Objetivos:

- mostrar la disposición correcta desde el primer renderizado;
- evitar movimientos de carteles y textos al terminar de cargar la página;
- mejorar la presentación de conciertos e históricos con cartel en móvil;
- mantener los carteles centrados y adaptados al ancho disponible.

El código equivalente que se cargaba dinámicamente desde `poster-thumbnails.js` fue retirado.

### Cabecera

En `src/components/Header.astro` se dio prioridad de carga al escudo principal mediante:

- `loading="eager"`
- `fetchpriority="high"`

El objetivo es que uno de los elementos visuales principales de la cabecera esté disponible antes y reduzca movimientos durante la carga.

### Layout general

En `src/layouts/Layout.astro` se preparó la carga anticipada de los nuevos estilos específicos del portal y de la axenda mediante el `head` de la página, en lugar de esperar a que JavaScript los genere posteriormente.

### Revisión de datos

En `src/pages/revision-datos.astro` se ajustó el desplazamiento automático hacia la caja de confirmación.

El navegador espera ahora a que el contenido actualizado se haya renderizado antes de calcular la posición del desplazamiento, mediante dos `requestAnimationFrame`.

Objetivo:

- que la confirmación aparezca en la posición correcta;
- evitar desplazamientos prematuros;
- mejorar la respuesta visual del formulario después de efectuar cambios.

---

## 4. Comprobaciones realizadas antes de publicar

Según el registro de Codex:

- **153 pruebas:** correctas.
- **TypeScript:** correcto.
- **ESLint:** correcto.
- **Compilación completa:** correcta.

El workflow de calidad presentaba un fallo previo relacionado con la auditoría de dependencias, no con la compilación ni con las pruebas funcionales de esta publicación.

### Auditoría de dependencias

El registro señala:

- 7 avisos en total;
- 2 de severidad moderada;
- 5 de severidad alta.

No se modificaron dependencias en este commit, por lo que esos avisos no fueron introducidos por esta publicación.

---

## 5. Verificación posterior al despliegue

Codex comprobó en producción los siguientes endpoints:

- `/portal/`
- `/axenda/`
- `/revision-datos/`
- `/contacto/`

Todos devolvieron **HTTP 200** en la comprobación registrada.

También se compararon con los archivos locales publicados los siguientes recursos:

- `/css/portal-home.css`
- `/css/agenda-mobile.css`
- `/js/portal-auth-diagnostics.js`
- `/js/poster-thumbnails.js`

El registro indica que los recursos servidos en producción coincidían con las versiones publicadas.

---

## 6. Comprobaciones de conservación de cambios anteriores

Durante la verificación final se confirmó que la publicación no eliminó cambios recientes ya existentes.

Se conservaron:

- el título **«Portal do coralista»**;
- el correo público **`secretaria@coralpolifonicapontevedra.org`**;
- la protección/ofuscación del correo aplicada por Cloudflare.

---

## 7. Conclusión

La corrección fue publicada en producción mediante el commit:

`d636a23afa0a180975be33da0bdbc13d0dcfaf2f`

Las pruebas funcionales, TypeScript, ESLint y la compilación completa finalizaron correctamente antes de la publicación.

La verificación posterior confirmó la disponibilidad de las páginas principales afectadas y la publicación de los nuevos recursos CSS y JavaScript.

El único problema indicado por el workflow de calidad corresponde a la auditoría de dependencias ya existente y no a los cambios incluidos en esta publicación.

---

## 8. Nota sobre este documento

Codex llegó a generar una actualización local de `STABILITY-REVIEW.md`, pero alcanzó el límite de uso antes de subir ese archivo al repositorio.

Este documento reconstruye ese informe a partir de:

1. el registro de ejecución conservado en la conversación;
2. el commit efectivamente presente en `main`;
3. los nueve archivos modificados que constan en el commit.

El informe reconstruido se incorporó posteriormente a la rama `main` como documentación de la publicación.
