# Estrutura de Apps Script

Esta é a convención oficial do repositorio para evitar despregues desde copias antigas ou incompletas.

- `apps-script/`: código fonte de desenvolvemento e referencia. Non se debe usar directamente para `clasp push` a produción.
- `apps-script-preview/`: proxecto despregable de preview. O seu `.clasp.json` corresponde ao entorno de preview.
- `apps-script-production/`: único espello despregable de produción. Calquera `clasp push` de produción debe facerse exclusivamente desde esta carpeta, tras comprobar que coincide coa versión validada.

As copias históricas deben recuperarse desde o historial de Git cando sexan necesarias; non deben conservar `.clasp.json` activos nin carpetas paralelas que poidan confundirse coa produción.

Regra de seguridade: nunca executar `clasp push --force` en produción. Antes de calquera cambio en Apps Script de produción débese revisar o diff, crear unha versión nova e conservar a versión anterior como punto de retorno.
