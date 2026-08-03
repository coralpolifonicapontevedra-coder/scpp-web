# Convencións do proxecto

## Nomes de rutas

- Usar nomes finais e claros: `/portal/concertos/`, `/portal/documentacion/`.
- Os sufixos `novo`, `nova`, `v2` ou similares só se admiten durante probas temporais.
- Ao promover unha versión, a ruta oficial conserva o nome estable.

## Nomes de ficheiros e código

- Astro: nomes descritivos en minúsculas e guións cando proceda.
- Functions: unha responsabilidade principal por endpoint.
- Apps Script: funcións internas con sufixo `_` cando non sexan chamadas directamente polo despachador.
- Scripts: verbos claros, por exemplo `migrate`, `verify`, `audit`.

## IDs

- Cada táboa debe ter un ID estable e único.
- Non usar o número de fila como clave funcional.
- Non xerar claves R2 a partir do nome unicamente.
- O ID debe aparecer ao principio da clave R2 cando sexa posible.

## Respostas JSON

Formato mínimo:

```json
{
  "ok": true
}
```

Formato de erro:

```json
{
  "ok": false,
  "etapa": "R2_OBJECT",
  "codigo": "NOT_FOUND",
  "erro": "Mensaxe comprensible"
}
```

Non ocultar durante o desenvolvemento todos os erros baixo unha mensaxe xenérica. En produción, a mensaxe visible debe ser segura e o detalle técnico debe quedar no rexistro.

## Etapas de erro recomendadas

- `REQUEST`
- `CONFIG`
- `AUTH`
- `PERMISOS`
- `FIREBASE`
- `APPS_SCRIPT`
- `APPS_SCRIPT_RESULT`
- `SHEETS`
- `R2_BINDING`
- `R2_KEY`
- `R2_OBJECT`
- `CACHE`

## Caché

- Debe indicar duración fresca e duración máxima de respaldo.
- Debe separarse por usuario ou nivel cando os datos sexan privados.
- Non se deben cachear publicamente datos persoais.
- Recoméndanse cabeceiras de diagnóstico como `X-SCPP-Cache` e `Server-Timing`.

## Cambios e probas

1. Modificar un módulo cada vez.
2. Non tocar módulos alleos salvo dependencia demostrada.
3. Probar primeiro a función pequena no seu contorno.
4. Probar despois o fluxo completo.
5. Manter unha ruta anterior só durante unha transición curta.
6. Retirar duplicidades cando a versión nova quede validada.
7. Actualizar o documento técnico se cambia a arquitectura.

## Git e despregue

- Mensaxes de commit breves e explicativas.
- Non incluír secretos no repositorio.
- Os workflows deben producir informes descargables.
- Un workflow en modo `plan` non pode escribir en Sheets nin R2.

## Interface

- Galego como lingua principal do portal.
- Tipografía corporativa común: Aptos, Calibri ou sistema equivalente.
- Estilo minimalista, granate como cor principal e uso moderado do dourado.
- Non introducir unha tipografía ou patrón visual distinto nun módulo sen xustificación documentada.
