# Arquitectura de rendemento da SCPP

## Estado

Documento normativo do framework SCPP.

Data de adopción: 2026-08-04.

## Obxectivo

Garantir que a web pública e privada responda de maneira rápida e estable, mesmo cando Google Sheets ou Apps Script estean temporalmente lentos ou non dispoñibles.

## Principio principal

**Ningunha páxina de lectura debe depender dunha consulta en tempo real a Google Sheets ou Apps Script.**

Google Sheets, AppSheet e Apps Script forman parte da capa de administración e sincronización. Cloudflare e R2 forman parte da capa de lectura da web.

## Modelo adoptado

### Administración

- AppSheet e Google Sheets continúan sendo a interface principal de administración.
- Apps Script valida e procesa cambios.
- Os cambios administrativos rexeneran o índice do módulo afectado.
- A escritura nunca se almacena en caché.

### Lectura web

- A web le índices JSON preparados en R2.
- Os índices conteñen os datos xa normalizados e as rutas definitivas.
- Cloudflare pode almacenar temporalmente a resposta dos índices.
- O navegador reutiliza datos e ficheiros mentres a súa versión non cambie.
- Se Google falla, a web conserva e serve a última versión válida.

## Fluxo oficial

```text
AppSheet / Google Sheets
          ↓ cambio administrativo
       Apps Script
          ↓ rexeneración
      Índice JSON en R2
          ↓ lectura rápida
Cloudflare Pages / Functions
          ↓
       Navegador
```

## Regras obrigatorias

1. Non consultar Apps Script ao abrir unha páxina cando exista un índice R2 válido.
2. Unha rexeneración fallida nunca debe eliminar o último índice correcto.
3. Cada módulo terá un índice independente.
4. Un cambio nun módulo só invalida o índice dese módulo.
5. Os listados de imaxes usan miniaturas; os orixinais só se descargan ao ampliar ou editar.
6. Os ficheiros versionados usan caché longa e URL estable por versión.
7. Os datos privados usan R2 privado e autenticación; nunca unha caché pública.
8. As accións de gardar, publicar, rexeitar ou eliminar non se almacenan en caché.
9. Toda optimización debe conservar deseño e funcionalidades, salvo decisión explícita documentada.
10. Cada módulo debe mostrar ou rexistrar métricas de rendemento durante a súa validación.

## Estados de caché

- `MISS`: non había índice e foi necesario crealo.
- `HIT`: o índice válido serviuse directamente desde R2 ou Cloudflare.
- `STALE`: serviuse a última versión válida e solicitouse unha actualización en segundo plano.
- `ERROR`: non existe un índice válido e a rexeneración fallou.

## Política de imaxes

### Galerías

- Miniatura recomendada: 600–800 px no lado maior.
- Formato recomendado: WebP ou JPEG optimizado.
- O mosaico nunca debe descargar todos os orixinais.
- O orixinal só se solicita ao abrir a ampliación.
- As miniaturas e orixinais deben incluír versión ou nome inmutable.

### Revisión e edición

- A lista de revisión procede dun índice privado en R2.
- A interface móstrase antes de descargar o orixinal.
- O orixinal transmítese como binario, non dentro dun JSON base64.
- Os orixinais xa abertos reutilízanse durante a sesión.
- A seguinte e a anterior poden precargarse en segundo plano.

## Índices previstos

```text
indices/galeria-publica-v1.json
indices/fotos-revision-v1.json
indices/noticias-v1.json
indices/repertorio-v1.json
indices/documentacion-v1.json
indices/concertos-v1.json
```

Os índices privados deben almacenarse no bucket privado.

## Invalidación

Un índice debe rexenerarse cando:

- se crea un rexistro publicado;
- se modifica un dato visible;
- se activa ou desactiva a publicación;
- se elimina ou substitúe un ficheiro;
- cambia a súa ruta ou versión.

A invalidación debe ocorrer despois dunha escritura correcta. Se a rexeneración falla, consérvase o índice anterior e rexístrase o erro.

## Obxectivos de rendemento

| Módulo | Obxectivo de primeira resposta | Obxectivo con caché |
|---|---:|---:|
| Galería pública | menos de 2 s | menos de 1 s |
| Lista de revisión | menos de 3 s | menos de 1 s |
| Navegación entre fotos precargadas | — | menos de 300 ms |
| Noticias | menos de 1,5 s | menos de 700 ms |
| Repertorio | menos de 2 s | menos de 1 s |
| Documentación | menos de 1,5 s | menos de 700 ms |

Os tempos de descarga dun orixinal dependen do seu tamaño e da conexión, pero non deben bloquear a interface nin a navegación.

## Método de validación

Cada proba seguirá este ciclo:

1. Diagnóstico.
2. Deseño técnico.
3. Implementación nun laboratorio illado.
4. Medición de `MISS`, `HIT` e `STALE`.
5. Comprobación de erros e fallos de Google.
6. Documentación do resultado.
7. Substitución do módulo real só se cumpre os obxectivos.

## Laboratorio

As probas de arquitectura publicaranse baixo:

```text
/laboratorio/rendemento/
```

Non se substituirá unha páxina real ata completar a validación correspondente.

## Criterio para reconsiderar D1

Valorarase a migración a Cloudflare D1 se, tras implementar correctamente este modelo:

- os índices non se rexeneran de forma fiable;
- se necesitan escrituras frecuentes directamente desde a web;
- aparecen conflitos de sincronización entre varios sistemas;
- as consultas requiren relacións ou filtros dinámicos complexos;
- os obxectivos de rendemento non se cumpren de maneira estable.

Ata entón, o modelo oficial é: **Sheets/AppSheet para administración; R2 e Cloudflare para lectura.**
