## Branch workflow — SCPP

This repository uses a strict two-branch operating model unless the user explicitly authorizes an exception:

- `preview` is the working and testing branch. Make requested changes directly on `preview`.
- Do **not** create feature/fix/agent branches by default.
- Create another branch only after explicit authorization from the user.
- `main` is the production branch. Do not modify, merge into, or otherwise advance `main` unless the user explicitly authorizes promoting tested Preview changes to Production.
- Keep Preview work isolated from Production. Production Apps Script deployments must not be changed while working in Preview unless the user explicitly authorizes it.
- Before starting work, verify the current branch is `preview` and that it is up to date with `origin/preview`.

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
