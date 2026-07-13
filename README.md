# SCPP Web

Sitio web del proyecto SCPP construido con Astro.

## Desarrollo local

Todos los comandos se ejecutan desde la carpeta del proyecto.

```sh
npm install
npm run dev
```

Servidor local: `http://localhost:4321`

## Build de producción

```sh
npm run build
npm run preview
```

La salida de producción se genera en `dist/`.

## Despliegue recomendado

El flujo más simple para compartir avances es:

1. Guardar el código en GitHub.
2. Conectar el repositorio a Netlify.
3. Dejar que Netlify publique automáticamente cada `push`.
4. Usar ramas o pull requests si quieres previews separadas.

Este repositorio ya incluye la configuración base para Netlify:

- Base directory: `Proyecto`
- Build command: `npm run build`
- Publish directory: `dist`

## Pasos en Netlify

1. Entra en Netlify y elige `Add new site`.
2. Selecciona `Import an existing project`.
3. Conecta tu cuenta de GitHub.
4. Elige este repositorio.
5. Revisa que Netlify detecte estos valores:

```text
Base directory: Proyecto
Build command: npm run build
Publish directory: dist
```

6. Pulsa `Deploy site`.

## Notas

- No hace falta subir manualmente archivos a Netlify en cada cambio.
- GitHub sirve para el control de versiones; Netlify sirve para mostrar el sitio funcionando.
- Si más adelante quieres un dominio propio, se puede conectar desde Netlify sin cambiar el proyecto.
