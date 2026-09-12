# LVCE Typing Benchmark

Measure editor typing and syntax-highlight rendering in LVCE Editor Only, its
single-thread variant, Monaco Editor, CodeMirror 6, CodeMirror 5, CodeJar
with Prism, and Ace Editor, plus browser-side IDE startup in the full LVCE Editor
and VS Code, under repeatable Chromium/Playwright workloads.

## Run locally

Node.js 24.15 or newer in the 24.x release line, or Node.js 26 or newer, is required.

To use the same Node.js version as CI, run `nvm install` and `nvm use`.

```sh
npm ci
npx playwright install chromium
npm run benchmark
npm run report
npm run benchmark:render
npm run report:render
npm run benchmark:startup
npm run report:startup
```

`npm run setup` generates `.tmp/static/` with pinned fixtures. All fixture work
runs sequentially. Monaco, both CodeMirror versions, CodeJar with Prism, and Ace are
bundled with Rollup, and every generated JavaScript artifact is minified with Rollup's Terser plugin. The
editor-only LVCE fixture contains only a minimal renderer process, the editor
worker, and the syntax-highlighting worker. The renderer process communicates
directly with both workers; there is no renderer worker or workbench chrome.

The LVCE Editor Single Thread fixture is generated from the same pinned
published LVCE packages. Its benchmark-side Rollup transform embeds the
renderer process, editor worker, syntax-highlighting worker, and HTML tokenizer
in one JavaScript file. Worker launch and message/RPC dispatch are replaced by
in-process command-map function calls, so the fixture creates no web workers
and performs no cross-thread serialization.

Ace is bundled from the pinned `ace-builds` package with its HTML mode included
locally. Typing uses plain text; rendering uses HTML syntax highlighting with
Ace's background validation worker disabled. Ace reports readiness after its
initial render, followed by the shared two-animation-frame wait for rendering.

The IDE startup fixtures are separate. LVCE's published assets are copied from
`@lvce-editor/static-server` and served by `@lvce-editor/server`. VS Code 1.132.1
comes from the pinned `@github1s/vscode-web` static export used by GitHub1s and
is served entirely from local generated assets. The VS Code package is roughly
107 MB unpacked but is not committed to this repository.

The default typing benchmark performs one warmup and 20 measured iterations for
both LVCE variants, Monaco, both CodeMirror versions, CodeJar with Prism, and Ace.
Each measured iteration:

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

CodeMirror 5 is installed under the `codemirror5` npm alias alongside CodeMirror 6.
CodeJar uses plain text for typing and Prism HTML highlighting for rendering;
its report version includes both CodeJar and Prism versions.

## Typing lag

The typing benchmark also runs a separate fresh-document latency pass for every
editor, with 100 individual `a` keypresses by default (`--lag-samples <n>`).
It waits for document readiness and an initial paint, then pauses for 16–65 ms
before dispatching each key. After the text DOM update and two animation frames,
it pauses again before the next key. The pause lengths use the same reproducible
golden-ratio sequence for every editor. They vary across several refresh intervals
to avoid synchronizing input with frame callbacks. A fixed 16 ms pause can still
produce biased results. All pauses occur outside the measured interval, after any
frame-based waits. Raw results and summary rows identify this cadence as
`varied-16-65ms-v2`; older immediate-dispatch results are not directly comparable.
The sample starts at the trusted keydown event's browser timestamp, excluding
Playwright transport time. A MutationObserver marks when the actual text nodes
contain the expected characters; editor model state alone is insufficient.

A Chromium trace with `devtools.timeline`, `blink`, and `blink.user_timing`
records the first `LocalFrameView::RunPaintLifecyclePhase` after that DOM mark
which contains a main-frame `Paint`. Its completion is the endpoint. The two
animation frames only bound the trace search; their callback timestamps are
not used as the latency. All timing subtraction uses Chromium's trace clock.
Missing marks, text updates, or paint evidence fail the pass instead of yielding
zero or silently dropping slow samples.

This is **keydown-to-browser-paint latency**, not key-to-photon latency. Chromium
paint records drawing work; subsequent GPU rasterization, compositor submission,
and physical display scanout are outside the metric. Frame scheduling and trace
instrumentation affect results. This is not pure editor execution time: it
includes waiting for Chromium to schedule rendering. Small differences should
not be treated as a reliable editor ranking. The minimal-control experiment found
roughly 0.4 ms of additional keydown-to-DOM time with tracing on this machine;
that is not a universal calibration or a number subtracted from results.
See [the cadence investigation](docs/typing-lag-cadence.md) and Chromium's
[paint lifecycle implementation](https://chromium.googlesource.com/chromium/src/third_party/+/refs/heads/main/blink/renderer/core/frame/local_frame_view.cc).
CPU sampling is disabled for this pass even when throughput profiling is enabled.
The first keystroke is included; latency has no discarded warmup. The document
grows across samples, and the next key is never dispatched before the prior
update has had a paint opportunity.

`results/typing-lag.json` preserves every sample and any pass failures, alongside
per-editor traces in `results/profiles/`. The homepage adds average/fastest and
median/p95 charts plus a table with sample counts, failed passes, and slowest
values. Statistics use individual keystrokes, with nearest-rank p95 and the
middle pair averaged for even-sized medians. Historical results without latency
data remain reportable. CI runs the same 100-sample pass for all seven editors.

## Syntax highlight rendering benchmark

`npm run benchmark:render` runs one warmup and 20 measured iterations for the
same seven editor-only fixtures. Every iteration launches a fresh Chromium
instance at 1280×720 and opens the same roughly 30-line Hello World HTML
document with HTML syntax highlighting enabled. The measurement ends after
highlighted tokens are in the DOM and two animation frames have completed.
After the measured runs, Playwright records one separate fresh load per editor
to `render-results/videos/`. Keeping the recorded loads separate prevents video
encoding from affecting benchmark measurements.

Raw results include DOMContentLoaded, syntax-highlight render time, sampled
JavaScript execution, main-page JavaScript heap, Chromium renderer-process
resident memory, and GPU-process resident memory on Linux. Chromium tracing
also records paint-event counts, main-thread paint time, and paint clip
areas. The LayerTree protocol supplies command counts from available DevTools
Paint Profiler snapshots and the final composited/content-bearing layer counts.
Paint areas are cumulative work estimates: overlapping or repainted pixels are
included once per paint event. `npm run report:render` writes a
dedicated static report to `.tmp/pages/rendering/` with the load recordings
stacked above comparison charts suitable for GitHub Pages.

## IDE startup benchmark

`npm run benchmark:startup` compares the full LVCE Editor workbench with the
static VS Code web workbench. Each warmup and measured iteration launches a
fresh Chromium process with fresh browser storage at 1280×720 and opens an empty
local workspace. Both the LVCE server and the static fixture server are ready
before measurement begins.

Startup is measured from browser navigation until the visible workbench shell
is present and has painted for two animation frames. Raw results include
startup wall time, DOMContentLoaded, sampled JavaScript execution, and trace
attribution for compilation/parsing, V8 initialization, profiler startup,
garbage collection, rendering, messaging, workers, and resources. Trace
categories can overlap or run in parallel and are not additive. After the
measured runs, separate startup recordings are written to
`startup-results/videos/`. `npm run report:startup` writes the comparison page
to `.tmp/pages/ide-startup/`.

Useful options:

```sh
npm run benchmark -- --editors monaco-editor,codemirror,ace-editor --iterations 5
npm run benchmark -- --editors codemirror5,codejar-prism --iterations 5
npm run benchmark -- --characters 1000 --warmups 2
npm run benchmark -- --no-profile
npm run report -- --input results --output .tmp/pages
npm run benchmark:render -- --editors monaco-editor,codemirror,ace-editor --iterations 5
npm run report:render -- --input render-results --output .tmp/pages/rendering
npm run benchmark:startup -- --ides lvce-editor,vscode --iterations 5
npm run report:startup -- --input startup-results --output .tmp/pages/ide-startup
```

## Continuous integration

Both pull requests and main CI start with a separate `test-and-lint` job that
installs dependencies and runs lint, unit tests, and type checking. Once it passes,
the `benchmark` job installs dependencies, generates fixtures, checks browser
fixtures, runs benchmarks, and uploads the results. Pull requests run one profiled
smoke iteration for typing, rendering, and IDE startup. Pushes to
`main` run 20 profiled iterations for all three benchmark types, upload the raw
results, profiles, and load recordings as an artifact, and deploy separate
editor, rendering, and IDE startup reports to GitHub Pages. The separate `deploy`
job uses the Pages artifact uploaded by `benchmark`.

The LVCE editor-only renderer and styles live in `fixtures/lvce` and are built
by `npm run setup`. They use `@lvce-editor/rpc` and `@lvce-editor/virtual-dom`
directly; no special `@lvce-editor/renderer-process` build is required. The
single-thread fixture uses the same renderer with a direct command dispatcher.
LVCE editor fixture versions in reports identify `@lvce-editor/editor-worker`.
