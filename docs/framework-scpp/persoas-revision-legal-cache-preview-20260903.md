# Preview · caché legal de revisións de Persoas

Cambio illado para evitar que cada xeración de revisión volva cargar `TextosLegais` desde Apps Script.

- Texto: `DATOS_PERSOA_SCPP`.
- Caché R2: `persoas/textos-legais/DATOS_PERSOA_SCPP.json`.
- TTL: 30 minutos.
- Revisión individual: carga as persoas desde `/api/persoas-v2`; o texto legal sae de R2 e só se refresca desde Apps Script cando a caché non existe ou caducou.
- Revisión masiva: usa a mesma caché; se está baleira, obtén a versión oficial unha vez desde Apps Script e gárdaa.
- A ligazón conserva dentro o texto e a versión exactos usados ao xerala.
- A aceptación final segue rexistrándose na táboa `Aceptación` mediante `actualizarPersoaAdministracion`.
- Non se modifican `persoas.astro`, `persoas-v2.js`, Repertorio nin Apps Script.
