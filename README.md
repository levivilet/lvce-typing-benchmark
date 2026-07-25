# LVCE Typing Benchmark

Measure typing throughput and JavaScript CPU time in LVCE Editor, Monaco Editor,
and CodeMirror under the same Chromium/Playwright workload.

## Run locally

Node.js 24 or newer is required.

```sh
npm ci
npx playwright install chromium
npm run benchmark
npm run report
```

`npm run setup` generates `.tmp/static/` with a pinned, rendered fixture for
each editor. Monaco and CodeMirror are bundled with esbuild. LVCE's published
static assets are copied from `@lvce-editor/static-server`; its fixture is
served by `@lvce-editor/server` during measurement because the editor uses
LVCE's filesystem and shared-process services.

The default benchmark performs one warmup and 20 measured iterations for every
editor. Each measured iteration:

1. opens a fresh browser context at 1280×720,
2. focuses an empty plain-text editor,
3. starts a Chromium trace-backed CPU profile,
4. types the character `a` 500 times with Playwright,
5. waits until the editor contains all 500 characters and two animation frames
   have completed, and
6. writes the wall time and raw CPU profile to `results/`.

The analysis sums sampled non-idle V8 time across the page and its workers. It
then computes the minimum, mean, maximum, and p95 for typing wall time and
JavaScript execution time. The generated report also has a separate
`lvce-cpu/` page with average self and inclusive CPU time per LVCE function,
execution-context shares, bundled source locations, and samples per run.

Useful options:

```sh
npm run benchmark -- --editors monaco-editor,codemirror --iterations 5
npm run benchmark -- --characters 1000 --warmups 2
npm run benchmark -- --no-profile
npm run report -- --input results --output .tmp/pages
```

## Continuous integration

Pull requests run lint, tests, type checking, fixture generation, and one full
500-character profiled iteration per editor. Pushes to `main` run 20 profiled
iterations per editor, upload the raw results/profiles as an artifact, and
deploy the generated charts to GitHub Pages.
