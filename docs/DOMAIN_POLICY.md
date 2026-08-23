## Política de dominios y flujo de validación

Propósito: dejar constancia de las reglas operativas para `preview` y `producción`, el flujo de validación y el comportamiento del monitor automático.

- **Entornos**:
  - `preview.coralpolifonicapontevedra.org` — entorno de pruebas (preview).
  - `coralpolifonicapontevedra.org` — entorno de producción.

- **Flujo de integración**:
  1. Los cambios funcionales se integran primero en la rama `preview`.
  2. Se validan en `preview`: rutas, autenticación, APIs y comportamiento funcional básico.
  3. Solo si la validación en `preview` es satisfactoria se abre/mergea `preview` → `main`.

- **Monitorización**:
  - Mientras el proyecto esté en fase de desarrollo, el workflow `monitor-web.yml` debe vigilar `preview` por defecto.
  - El monitor realiza comprobaciones de solo-lectura y captura artefactos para investigación (headers, cuerpos parciales).

- **URLs canónicas para comprobaciones**:
  - No usar `*.pages.dev` como URL canónica para comprobaciones regulares; usar el dominio `preview` o `production` según corresponda.

- **Protección de ramas y excepciones**:
  - Los bypass administrativos de la protección de `main` deben ser excepcionales.
  - Todo bypass debe dejarse justificado en el PR o en el ticket asociado, indicando motivo, aprobador y auditoría posterior.

Fecha: 2026-08-23
