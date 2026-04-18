# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project shape

TCG Helper is a **zero-dependency static site**: plain HTML, CSS, and JavaScript served as-is. There is no build step, no package manager, no bundler, no test runner, and no linter. Do not introduce any of these without explicit user approval — every new dependency works against the "runs on any simple static host" constraint.

## Architectural rules that span files

- **Styling comes from Pico.css (classless) loaded via CDN** in `index.html`. Prefer semantic HTML (`<main>`, `<article>`, `<form>`, `<button>`, etc.) and let Pico style it. Only add custom CSS in `css/styles.css`, which is linked *after* Pico so it overrides defaults. Do not rewrite existing semantic HTML to use utility classes or a different framework.
- **JavaScript is loaded as an ES module** (`<script type="module" src="js/main.js">`). New JS files go under `js/` and are pulled in via `import`/`export` from `main.js` (directly or transitively). Do not add classic `<script>` tags or globals; do not introduce a bundler to work around module loading.
- **ES module consequence: `file://` won't work.** Any feature that runs JS must be previewed over HTTP (e.g. `python3 -m http.server 8000` from repo root). If a change appears broken when double-clicking `index.html`, serve it instead before investigating further.
- **All asset paths are relative** (`css/styles.css`, `js/main.js`, no leading `/`). This keeps the site working both at a domain root and under a GitHub Pages project subpath. Keep new paths relative too.

## Deployment

`.github/workflows/deploy.yml` deploys the repo root to GitHub Pages on push to `main` (and via manual `workflow_dispatch`). The workflow uploads the whole repo as the Pages artifact — there is no build output directory. Anything committed at the root is served. The `.nojekyll` file is load-bearing: it stops GitHub Pages from running Jekyll and hiding `_`-prefixed paths.

## Branching

Development happens on feature branches named `claude/<topic>-<slug>`. Never push directly to `main` — `main` is the deploy branch. Open PRs from feature branches into `main` only when the user explicitly asks for one.

## Planning conventions

Future plans should respect the "environment is already set up" baseline:

- Keep features in the existing `index.html` / `css/styles.css` / `js/*.js` structure unless the change genuinely needs a new top-level file.
- Prefer reusing Pico.css semantics over writing new CSS.
- Any data the app needs (card lists, rulings, etc.) should be loaded at runtime from static files in the repo or from public APIs via `fetch` — no server component.
