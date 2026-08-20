# Administración → Concertos: arquitectura de referencia

## Obxectivo

Construír Concertos unha soa vez e despregalo en Preview e Producción cambiando unicamente configuración de contorno.

## Regras non negociables

- Ensaios queda conxelado. Non se modifica nin a UI nin a lóxica nin os scripts existentes.
- `feature/admin-concertos` nace de `main` e será a única rama de desenvolvemento desta funcionalidade.
- O código de Cloudflare debe ser idéntico en Preview e Producción. Só cambian variables de contorno (`APPS_SCRIPT_WEBAPP_URL`, bindings R2 e demais configuración).
- Apps Script tamén debe converxer cara a unha única base de código; Preview e Producción só poden diferir nas Script Properties e no destino de `clasp`.
- Non se considera o módulo rematado ata superar a proba integral definida ao final deste documento.

## Fonte de verdade e lectura rápida

- Sheets/AppSheet conservan o dato estruturado e as relacións.
- R2 serve os índices de lectura rápida para o Portal e a web pública.
- Cada escritura administrativa debe seguir: validar → escribir Sheet → rexenerar/actualizar índice R2 → responder.
- Non se deben usar CSV públicos como fonte operativa do Portal privado.

## División de responsabilidades

### Administración → Concertos

É o único lugar de escritura e mantemento:

1. Ficha
   - alta
   - baixa segura
   - data
   - nome
   - cidade
   - lugar
   - hora
   - descrición
   - estado
   - Mostrar_Web
   - Destacado_Web

2. Programa
   - catálogo desde Repertorio
   - buscar/seleccionar obra
   - engadir/retirar
   - ordenar
   - notas
   - solista
   - persistencia en `ConcertosRepertorio`

3. Asistentes
   - patrón funcional inspirado en Ensaios, pero implementación independente
   - cordas separadas
   - persoas ordenadas por apelidos
   - marcar asistentes do concerto
   - persistencia en `AsistenciasConcertos`

4. Cartel
   - seleccionar ficheiro
   - subir/substituír
   - gardar referencia no concerto
   - publicar en R2 segundo a política de medios de Concertos

5. Tríptico / programa de man
   - seleccionar ficheiro
   - subir/substituír
   - gardar referencia no concerto
   - publicar en R2 segundo a política de medios de Concertos

Todo depende do mesmo `Id_Concerto`.

### Portal → Concertos

Só consulta:

- concertos desde índice R2 privado
- programa
- obras con ligazón a `/portal/repertorio/?id=...`
- asistentes reais por concerto
- cartel
- tríptico
- informe de asistencia derivado de `AsistenciasConcertos`

Non crea, modifica nin elimina datos.

## Problemas detectados na auditoría inicial

- A antiga rama `agent/administracion-concertos` diverxe fortemente de `main` e mestura cambios alleos ao módulo.
- Os snapshots de Apps Script Preview/Producción evolucionaron por separado.
- `src/pages/portal/concertos-novo.astro` en `main` aínda contén URLs CSV de Google hardcoded para Concertos, Programa e Repertorio.
- `functions/_lib/apps-script.js` xa soporta selección de Apps Script mediante variables de contorno, polo que non debe duplicarse o código Cloudflare para Preview/Producción.
- O control actual de paridade de Apps Script verifica presenza de funcións/ficheiros, non igualdade efectiva do código.

## Orde de implementación

1. Consolidar configuración Preview/Producción sen modificar Ensaios.
2. Pechar backend de ficha + Programa.
3. Pechar backend/UI de Asistentes.
4. Pechar Cartel + Tríptico (Sheet + R2).
5. Substituír lectura CSV de Portal → Concertos por índice R2 privado.
6. Restaurar asistentes históricos e informe.
7. Engadir ligazóns do programa a Repertorio.
8. Proba integral en Preview.
9. Merge do mesmo código a `main`; non hai segunda implementación funcional.

## Proba integral obrigatoria

Nun concerto de proba debe ser posible, sen editar Sheets manualmente:

1. crear a ficha;
2. engadir e ordenar obras;
3. rexistrar asistentes por cordas;
4. subir cartel;
5. subir tríptico;
6. gardar;
7. abrir Portal → Concertos e ver ficha, programa, asistentes, cartel e tríptico;
8. abrir unha obra do programa e chegar a Repertorio;
9. comprobar que o informe de asistencia contabiliza o concerto;
10. comprobar que a lectura provén de R2/índice actualizado e non dun CSV público atrasado.

Só despois desta proba o módulo pode considerarse rematado.
