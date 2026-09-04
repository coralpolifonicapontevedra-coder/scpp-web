# REGRA CRÍTICA E OBRIGATORIA PARA PRODUCIÓN

Esta sección **debe lerse antes de calquera modificación que poida afectar a Producción**, especialmente Apps Script, permisos, autenticación, administración, cachés, R2, Sheets ou fluxos compartidos.

## Regra de ouro

**Nunca se debe substituír nin publicar en Producción un paquete completo procedente de Preview, dunha copia local ou do repositorio sen comprobar antes o estado real que está executándose en Producción.**

Antes de tocar Producción é obrigatorio:

1. Identificar exactamente o módulo, acción e script afectado polo cambio.
2. Obter primeiro o código **real e vivo de Producción** (`clasp pull` ou mecanismo equivalente) nun espello temporal separado.
3. Comparar ese script real de Producción co script equivalente xa probado en Preview/probas.
4. Revisar e entender **todas as diferenzas**, non só a liña que se pretende copiar, para detectar dependencias, dispatchers compartidos, funcións comúns ou cambios doutras áreas.
5. Avaliar expresamente se o cambio pode afectar negativamente outros módulos ou o resto da web.
6. Aplicar **só o cambio mínimo imprescindible** ao script ou ficheiro que realmente o necesita. Non arrastrar outros cambios de Preview.
7. Se a ferramenta de publicación (`clasp push`, deployment, etc.) sobe un proxecto completo, a copia de traballo debe partir do **proyecto vivo de Producción**, non da carpeta versionada de Preview nin dunha copia potencialmente desactualizada.
8. Antes de publicar, comprobar o diff efectivo. Se aparece calquera ficheiro ou cambio non relacionado co obxectivo, **deter a publicación** e revisar.
9. Executar as probas específicas do módulo e, cando corresponda, lint/build e probas de regresión dos puntos compartidos afectados.
10. Conservar sempre unha vía clara de rollback á versión/deployment anterior.

### Prohibición expresa

Está prohibido facer un `clasp push --force`, merge, copia masiva ou substitución de carpetas de Producción simplemente porque Preview funciona. Preview é a referencia funcional; **o estado vivo de Producción é a base obrigatoria da modificación**.

Para Apps Script, consultar tamén `docs/framework-scpp/apps-script-production-promotion.md` antes de calquera publicación.

## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
