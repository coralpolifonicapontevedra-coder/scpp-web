# Incidencia Ensaios v2 — Obras 502

Data: 28/08/2026

A páxina principal xa carga desde R2 compartido. O erro 502 queda illado á importación de programas de concerto.

Causa identificada: a importación enviaba varias escrituras `gardarEnsaioRepertorioPortal` en paralelo. O dispatcher de Apps Script protexe as escrituras con `ScriptLock`, polo que varias chamadas concorrentes poden competir entre si.

Corrección inmediata: executar as escrituras do programa de forma secuencial, mantendo R2 como fonte de lectura e actualizando o índice compartido tras completar a importación.

Seguimento: se o tempo de escritura segue sendo excesivo, a seguinte evolución será preparar Obras no borrador R2 e consolidar coa Sheet ao premer `Aceptar`, reutilizando `functions/api/ensaios-borrador.js`.
