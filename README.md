# SCPP Web

Web pública e portal privado da Sociedade Coral Polifónica de Pontevedra.

> **Antes de calquera modificación que poida afectar a Producción é obrigatorio ler `AGENTS.md` e, para Apps Script, `docs/framework-scpp/apps-script-production-promotion.md`.** A regra é sempre a mesma: partir do código vivo de Producción, comparalo co equivalente validado en Preview, analizar o impacto sobre o resto da web e aplicar só o cambio mínimo imprescindible.

O proxecto está construído con Astro e desprégase en Cloudflare Pages. As funcións de servidor execútanse como Cloudflare Pages Functions; Cloudflare R2 proporciona o almacenamento operativo de ficheiros públicos e privados.

## Arquitectura

A plataforma segue o Framework SCPP documentado no propio repositorio:

- Astro e Cloudflare Pages para a interface pública e o portal privado.
- Cloudflare Pages Functions/Workers para autenticación, autorización, caché e entrega de ficheiros.
- Firebase Authentication para identificar os usuarios do portal.
- Apps Script para permisos, regras de negocio e lectura ou escritura de metadatos.
- Google Sheets e AppSheet como capa de administración de datos.
- Cloudflare R2 como orixe operativa dos ficheiros servidos pola web.
- Google Drive como zona de entrada, traballo e respaldo cando corresponda, nunca como orixe directa das descargas web.
- GitHub Actions para tarefas de migración, sincronización, índices e auditoría.

O modelo oficial de lectura é:

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

As páxinas de lectura deben utilizar índices válidos de R2 e conservar a última versión correcta se Google Sheets ou Apps Script non están dispoñibles temporalmente.

## Documentación técnica

Antes de modificar a arquitectura, os fluxos de ficheiros, os permisos ou a caché, consulta:

- [Regra obrigatoria para axentes e Producción](AGENTS.md)
- [Promoción segura de Apps Script a Producción](docs/framework-scpp/apps-script-production-promotion.md)
- [Framework SCPP](docs/framework-scpp/README.md)
- [Arquitectura xeral](docs/framework-scpp/ARQUITECTURA.md)
- [Arquitectura de rendemento](docs/framework-scpp/ARQUITECTURA-RENDIMIENTO.md)
- [Gestor de Arquivos](docs/framework-scpp/GESTOR-DE-ARQUIVOS.md)
- [Convencións do proxecto](docs/framework-scpp/CONVENCIONS.md)
- [Decisións técnicas](docs/framework-scpp/DECISIONS.md)
- [Folla de ruta](docs/framework-scpp/ROADMAP.md)
- [Guía de deseño da web pública](docs/GUIA-DESEÑO-WEB-PUBLICA.md)

A documentación é viva: un cambio estrutural non se considera pechado ata actualizar o documento técnico correspondente.

## Requisitos

- Node.js 22.12.0 ou superior compatible con Astro.
- npm.

## Desenvolvemento local

Todos os comandos se executan desde a raíz do repositorio.

```sh
npm ci
npm run dev
```

Servidor local de Astro:

```text
http://localhost:4321
```

O comando de desenvolvemento xera primeiro as miniaturas locais dos carteis.

## Build de produción

```sh
npm run build
npm run preview
```

A saída estática xérase en `dist/`.

## Despregue en Cloudflare Pages

Cloudflare Pages é a plataforma oficial de produción.

Configuración base do proxecto:

```text
Build command: npm run build
Build output directory: dist
Node.js: 22.12.0
Functions directory: functions
```

Os pushes e pull requests deben validarse antes de promover cambios a produción. As variables, segredos e bindings configúranse en Cloudflare, nunca no repositorio.

Entre os recursos utilizados polo código están os buckets R2 públicos e privados, Firebase Authentication e os tokens de integración con Apps Script. A lista canónica de bindings e variables aínda debe documentarse como parte da [folla de ruta do Framework SCPP](docs/framework-scpp/ROADMAP.md); non copies valores reais nun ficheiro versionado.

## Estrutura principal

```text
src/                    Páxinas, compoñentes, layouts, estilos e lóxica Astro
functions/              Cloudflare Pages Functions e utilidades de servidor
public/                 Recursos estáticos
scripts/                Xeración, migración, sincronización e auditoría
docs/framework-scpp/    Arquitectura, decisións, convencións e folla de ruta
```

## Principios de desenvolvemento

1. Un módulo e unha responsabilidade principal por cambio.
2. IDs funcionais estables; nunca o número de fila como identidade.
3. R2 como orixe dos ficheiros servidos pola web.
4. Sheets para datos e metadatos, non binarios nin Base64.
5. Autenticación e permisos definitivos no servidor.
6. Datos privados nunca en caché pública.
7. Migracións seguras, idempotentes e inicialmente en modo `plan`.
8. Rutas temporais só durante a validación; despois debe quedar unha única ruta oficial.
9. Actualizar a documentación cando cambie a arquitectura.
10. Non incluír secretos, tokens nin credenciais no repositorio.
11. Para calquera cambio en Producción, partir do estado vivo, comparar con Preview, analizar impacto, aplicar un parche mínimo e manter rollback.

## Comprobación mínima

Antes de integrar un cambio:

```sh
npm ci
npm run build
```

Para cambios da interface pública, revisa en escritorio e móbil as rutas indicadas na [guía de deseño](docs/GUIA-DESEÑO-WEB-PUBLICA.md). Para cambios de datos, caché o ficheiros, valida tamén os estados `MISS`, `HIT`, `STALE` e os fallos temporais dos servizos de Google.
