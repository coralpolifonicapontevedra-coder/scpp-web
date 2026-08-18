# Identidade e permisos do Portal do Coralista

## Principio xeral

O Portal do Coralista debe funcionar cunha única identidade de sesión. Unha vez autenticada unha persoa mediante Firebase, todos os módulos privados deben reutilizar esa identidade e non volver pedir nin inferir quen é o usuario mediante mecanismos paralelos.

Fluxo obrigatorio:

1. Firebase valida a sesión e entrega a identidade autenticada (UID + correo verificado).
2. O backend resolve esa identidade contra o rexistro persoal autorizado do portal.
3. Cada módulo aplica os seus permisos sobre esa identidade xa resolta.
4. As operacións persoais nunca aceptan do navegador un Id_Persoa arbitrario cando poden deducilo da sesión.

Esta regra evita suplantacións e inconsistencias entre módulos e debe aplicarse a Perfil, Ensaios, Concertos, Partituras, Fotos, Administración e futuros módulos privados.

## Regra de seguridade

Ocultar un botón non é unha medida de autorización. Os permisos deben comprobarse tamén no backend.

- Coralista: só pode acceder aos datos e accións que lle corresponden persoalmente.
- Xunta Directiva: pode acceder ás funcións de xestión expresamente autorizadas.
- Administración: pode acceder ás funcións administrativas expresamente autorizadas.
- Dirección ou outros perfís: só aos módulos e accións definidos para ese rol.

Unha petición manipulada manualmente debe fallar se tenta superar estes permisos.

## Ensaios

### Acceso dos coralistas

Os coralistas ordinarios acceden a `Obras a ensaiar` e poden consultar as obras do ensaio seleccionado. Non teñen acceso ao control de asistencia, lista de asistentes, análise de asistencias nin finalización do ensaio.

O botón `Aviso de non asistencia` é unha acción persoal. O navegador envía a sesión Firebase, o ensaio e o tipo de aviso; o servidor resolve automaticamente a persoa autenticada e grava só o seu propio rexistro.

Non se debe enviar nin confiar nun `idPersoa` escollido polo cliente para esta acción.

### Acceso da Xunta Directiva

A Xunta Directiva dispón de:

- Obras a ensaiar e edición do borrador.
- Lista de asistentes e control por cordas.
- Estados: Asiste / Non asiste / Non asiste con xustificación.
- Análise histórica por período, corda, persoa e ranking.
- Finalizar ensaio.

### Persistencia

Durante a preparación e o control do ensaio, obras e asistencias permanecen no borrador privado de R2.

As Sheets non se actualizan durante o traballo ordinario. Só ao pulsar `Finalizar ensaio` a Xunta consolida o resultado definitivo nas Sheets. O histórico e as análises deben utilizar datos xa consolidados, non borradores provisionais.

### Aviso persoal de ausencia

Endpoint: `functions/api/ensaios-aviso.js`.

Comportamento:

1. Valida o token Firebase.
2. Usa o correo autenticado para resolver a persoa no respaldo de identidades/perfis de R2.
3. Prioriza un perfil individual se contén identificador; se non, utiliza o índice de Persoas.
4. Comproba que o rexistro corresponde a un coralista activo.
5. Grava no borrador R2 só a ausencia desa persoa para o ensaio indicado.
6. Permite ausencia simple ou ausencia xustificada con motivo.

O índice de administración de Persoas usa actualmente os campos normalizados `idPersoa`, `id`, `rowId`, `correo`, `voz` e `activo`. Os consumidores deben manter compatibilidade con estes nomes e non asumir que o correo se chama exclusivamente `correoElectronico`.

## Invariantes que non deben romperse

- Un login debe servir para todo o portal privado.
- Un módulo non debe crear unha segunda identidade propia.
- As accións persoais deben deducir a persoa desde a sesión no servidor.
- R2 é o espazo de traballo de Ensaios; Sheets é a consolidación ao finalizar.
- O control de asistencia é exclusivo da Xunta Directiva.
- Os coralistas non reciben listaxes de persoas nin datos persoais alleos para usar Ensaios.
- Non expoñer teléfonos, correos ou outros datos persoais no módulo de Ensaios.
- Cambios visuais e cambios de permisos deben revisarse por separado para evitar regresións.

## Paridade entre Preview e produción

Unha Preview correcta non garante por si soa que o mesmo código se comporte igual ao ocupar a ruta definitiva de produción. Antes de substituír unha páxina existente débense revisar tamén todos os comportamentos asociados especificamente á URL de produción.

Comprobación obrigatoria antes de promover unha nova páxina:

1. Revisar `middleware` de Cloudflare/Pages e calquera regra condicionada por `pathname`.
2. Buscar scripts JavaScript, estilos, HTMLRewriter, redireccións ou compatibilidade histórica que se inxecten só na ruta antiga.
3. Comparar os recursos cargados pola Preview e pola ruta definitiva.
4. Retirar ou adaptar expresamente os parches da implementación anterior antes de activar a nova versión.
5. Facer unha proba funcional na URL real de produción despois do despregamento, aínda que a Preview xa fose aprobada.

### Incidencia de Ensaios ao pasar a produción — 18/08/2026

A nova páxina de Ensaios funcionaba correctamente na Preview `/portal/ensaios-v2/`, pero ao substituír a páxina antiga en `/portal/ensaios/` o control de asistencia deixou de permitir seleccionar correctamente persoas e aparecían estados previos de maneira incorrecta.

A causa non estaba na nova páxina. `functions/portal/_middleware.js` conservaba unha regra específica para `/portal/ensaios` que inxectaba scripts e estilos da implementación antiga (`ensaios-borrador-r2.js`, `ensaios-eliminar-ensaio.js` e a UI antiga). Esa inxección non se executaba na ruta de Preview e, por iso, o fallo só apareceu en produción.

A solución foi retirar da ruta definitiva de Ensaios esa inxección antiga, mantendo intactas as demais funcións do middleware. Tras o novo despregamento, produción recuperou o mesmo comportamento aprobado en Preview.

Regra derivada: **cando Preview funciona e produción falla, comprobar primeiro middleware, scripts, estilos e regras ligadas á URL de produción antes de modificar o módulo que xa foi validado.**

## Incidencia de identidade resolta o 18/08/2026

O aviso persoal devolvía `Non foi posible identificar o teu rexistro de coralista` malia existir unha sesión válida. A causa era que `ensaios-aviso.js` buscaba o correo principalmente como `correoElectronico`, mentres que o índice `persoas/cache/perfis.json` xerado por Administración Persoas utiliza `correo`. Ademais, o perfil individual pode non incluír o Id_Persoa.

A corrección foi:

- aceptar `correo`, `correoElectronico`, `email` e variantes compatibles;
- aceptar `idPersoa`, `id`, `rowId`, `Row ID` e variantes compatibles;
- se o perfil individual non contén identificador persoal, continuar a resolución no índice de Persoas en vez de dar por concluída a busca.

Esta corrección non modifica o deseño de Ensaios.

## Mantemento futuro

Se se centraliza a identidade nun servizo común do backend, `ensaios-aviso.js` e os demais endpoints deben pasar a consumir ese servizo en lugar de duplicar a función de resolución. A interface pública dese servizo debería devolver como mínimo: UID Firebase, correo autenticado, Id_Persoa, estado activo e roles/permisos efectivos.
