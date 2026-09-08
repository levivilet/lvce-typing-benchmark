# Typing-lag cadence investigation

## Finding

The first version measured Chrome trace timestamps correctly but generated an
unrepresentative input cadence. It waited for two animation frames after the DOM
update, polled completion using Playwright's default animation-frame polling,
and immediately armed/dispatched the next key. That repeatedly placed inputs at
almost the same phase of the refresh cycle. The resulting 14–16 ms medians were
largely rendering-scheduler wait, not editor execution time.

In PR #29's saved CI trace, 98 of 99 CodeJar keystrokes arrived in the first quarter
of the 60 Hz frame relative to the preceding completion callback. The median gap
was 2.285 ms. Median keydown-to-DOM time was 0.815 ms; median DOM-to-first-Paint
wait was 13.843 ms; the first Paint event itself lasted 0.044 ms. The parser selected
the first paint lifecycle following the text update, rather than skipping an
earlier valid paint. These component medians are not additive statistics.

## Controlled experiment

A native contenteditable control, without any editor library, used the production
sample observer and trace parser with 100 sequential keys. The only change between
the first three runs was the pre-key pause. Chromium ran headless at 1280×720 with
the same trace categories and launch flags as the benchmark.

| Pause | Mean keydown-to-paint | Mean keydown-to-DOM | Keystrokes in each refresh quarter |
| --- | ---: | ---: | --- |
| Immediate | 10.948 ms | 1.568 ms | 2 / 94 / 3 / 0 |
| Fixed 16 ms | 2.243 ms | 1.563 ms | 3 / 83 / 11 / 2 |
| Varied 16–65 ms | 4.946 ms | 1.666 ms | 24 / 20 / 27 / 28 |
| Varied, tracing disabled | unavailable | 1.224 ms | 25 / 21 / 26 / 27 |

These are single local diagnostic runs, not published editor comparison results
or confidence bounds. The varied experiment used a reproducible multiplicative
sequence; the production fix uses the equivalent golden-ratio progression to
cover the same integer pause range. Frame-quarter counts use the gaps between a
preceding completion callback and the next key, modulo the headless 60 Hz period.
They diagnose arrival-phase concentration; they do not measure presentation time.

A fixed 16 ms pause lowered the headline number but still concentrated arrivals
in one refresh quarter. Therefore lowering the number alone is not an accuracy
criterion. Tracing also added about 0.4 ms to the control's average DOM-update
time in this comparison. This is a rough overhead indication; it is not a
calibration applicable to every editor or host, and it is not subtracted.

## Fix and regression

Every sample now waits a reproducible 16–65 ms outside its measured interval,
after all frame-based completion waits and before arming/dispatching the key.
The same sequence is used for each editor. No frame wait is inserted after that
pause. The browser trace still supplies both the keydown and paint timestamps;
requestAnimationFrame only bounds the search for the completed paint.

A separate experiment replaced the broad `blink` trace category with `benchmark`,
which also emits the required paint lifecycle. It retained all 100 paint samples
but increased the trace from 27,541 events / 4.84 MB to 34,929 events / 7.65 MB by
enabling additional browser instrumentation. The production trace configuration
therefore remains unchanged. Reducing recorder overhead requires a separately
validated approach; the cadence fix does not claim to eliminate it.

Raw results and summaries include `cadence: "varied-16-65ms-v2"`. The report
labels legacy immediate-dispatch rows and warns against comparing the two
methodologies directly.

`node --test browser-test/typing-lag-cadence.test.ts` exercises the actual production
runner against native contenteditable, retaining its normal waits, dispatch,
tracing, and parser. Before the fix it failed in about four seconds:

```text
Expected at least 16 ms idle before the next key; shortest gap: 5.593
```

The test requires at least 16 ms between completion and the next key, variable
pauses, and coverage across refresh quarters. It does not require a low latency
value, which would merely reward another scheduling bias.

## Interpretation

The number measures keydown-to-browser-paint completion under this workload.
It includes input processing, editor work, layout, and waiting for a rendering
opportunity. It excludes later GPU rasterization, compositing, and physical screen
scanout. Headless CI, trace overhead, operating-system scheduling, and the chosen
input cadence limit how closely it predicts interactive use. Small differences
between editors are not a reliable ranking without repeated independent runs.

Chrome documents the connection between rendering scheduling and the common
16.66 ms frame interval in its [Long Animation Frames documentation](https://developer.chrome.com/docs/web-platform/long-animation-frames).
The endpoint is defined by Chromium's [paint lifecycle implementation](https://chromium.googlesource.com/chromium/src/third_party/+/refs/heads/main/blink/renderer/core/frame/local_frame_view.cc).
