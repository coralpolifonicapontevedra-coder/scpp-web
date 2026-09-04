# Promoción segura de Apps Script a produción

> **LECTURA OBRIGATORIA antes de calquera modificación en Producción.**
>
> A regra principal é: **partir sempre do Apps Script vivo de Producción, comparalo co equivalente validado en Preview e aplicar só o cambio mínimo imprescindible**. Nunca se debe publicar unha copia completa de Preview ou do repositorio sobre Producción sen esa comparación previa.

Este procedemento evita cambios manuais no editor de Apps Script e, sobre todo, evita sobrescribir Producción con ficheiros alleos ao cambio. GitHub conserva o traballo versionado e `clasp` é o mecanismo de lectura/publicación, pero **o estado vivo de Producción é a base obrigatoria de toda modificación de Producción**.

## Protocolo obrigatorio previo

Antes de modificar ou publicar calquera Apps Script de Producción:

1. Identificar o módulo, acción, función e ficheiro concretos afectados.
2. Executar `clasp pull` contra o proxecto real de Producción nunha carpeta temporal ou espello separado.
3. Obter o script equivalente de Preview/probas que xa foi validado funcionalmente.
4. Comparar **Producción real vs Preview** antes de editar nada.
5. Revisar todas as diferenzas relevantes e localizar dependencias compartidas: `doPost`, dispatchers, permisos, utilidades, propiedades, cachés, R2, Sheets e chamadas doutros módulos.
6. Determinar expresamente se copiar o cambio pode alterar negativamente outras partes da web.
7. Aplicar só as liñas/funcións imprescindibles ao espello obtido desde Producción.
8. Comprobar o diff efectivo antes do `push`. Se aparecen cambios ou ficheiros non relacionados, **deter a publicación**.
9. Executar probas específicas e regresión sobre os puntos compartidos afectados.
10. Conservar a versión/deployment anterior como rollback e actualizar unicamente o deployment correcto de Producción.

## Prohibicións

- Non facer `clasp push --force` desde `apps-script-preview`.
- Non usar directamente unha copia local antiga como base de Producción.
- Non asumir que `apps-script-production` no repositorio coincide necesariamente co código vivo sen comprobalo.
- Non copiar un paquete completo porque Preview funcione.
- Non modificar un dispatcher ou ficheiro compartido para resolver un módulo sen comprobar previamente que o resto dos consumidores dese ficheiro permanecen intactos.
- Non continuar se o diff inclúe cambios alleos ao obxectivo.

## Principios

- Non editar `Código.js` manualmente no editor de Apps Script como método habitual de promoción.
- Antes de cada promoción, obter unha copia actual do proxecto de Producción con `clasp pull` nunha carpeta temporal separada.
- Os scripts preparadores deben partir dese espello vivo, buscar un punto de integración coñecido e fallar se a estrutura cambiou.
- A preparación non publica nada: sempre debe haber unha revisión do diff efectivo antes do `clasp push`.
- Preview é a referencia funcional; Producción viva é a base técnica sobre a que se aplica o cambio.

## Administración → Ensaios

1. Traballar nunha rama de release creada desde `main`.
2. A rama debe conter só as pezas do módulo administrativo e non cambios no módulo normal `/portal/ensaios/`.
3. Preparar unha carpeta temporal clasp de Producción e executar nela `clasp pull` contra o proxecto correcto de Producción.
4. Comparar o código vivo co código validado de Preview e identificar exactamente o cambio que se quere trasladar.
5. Aplicar un preparador determinista ou un parche mínimo exclusivamente sobre a copia obtida do código vivo.
6. Revisar o diff completo e comprobar que non modifica `ensaios-portal`, asistencias, repertorio, caché, finalización de ensaio nin outros módulos non relacionados.
7. Só se a revisión é correcta, executar `clasp push --force` desde ese espello temporal da Producción viva.
8. Crear unha nova versión e actualizar exclusivamente o deployment de Producción utilizado pola web.
9. Comprobar o módulo afectado e os puntos compartidos despois da publicación, mantendo dispoñible o rollback inmediato.

## Regra para futuras promocións

Para Concertos, Persoas, Repertorio, Permisos ou calquera outro módulo debe reutilizarse este mesmo patrón. **Non existe excepción por tratarse dun cambio pequeno**: primeiro Producción viva, despois comparación con Preview, análise de impacto, parche mínimo, diff limpo, probas e rollback.
