# Reaction Timer

A minimalist reaction-time game with a procedural Three.js centrepiece. No
framework, no backend — plain TypeScript, the DOM, and a single WebGL shape.
Everything runs client-side and builds to static `HTML/CSS/JS`.

**Stack:** Vanilla TypeScript · Three.js · Tailwind CSS · Vite

---

## Run it

```bash
npm install
npm run dev      # local dev server (http://localhost:5173)
npm run build    # type-check + static build into dist/
npm run preview  # serve the built dist/ locally
```

Deploy the `dist/` folder to any static host (GitHub Pages, Netlify, Vercel).
`base: './'` in `vite.config.ts` keeps asset paths relative, so it also works
from a subfolder like `/projects/reaction-timer/`.

---

## Architecture

Three clean layers with a one-way data flow. The engine is the single source
of truth; the DOM and the 3D scene are pure subscribers that never contain
game logic.

```
pointer / key ─▶ ui.ts ─▶ engine.handleInput(now) ─▶ new GameState ─▶ ui + scene
```

```
reaction-timer/
├── index.html            # semantic markup, mounts the scene + readout
├── src/
│   ├── game-state.ts     # STATE  — state machine, timing, stats (no DOM/GL)
│   ├── ui.ts             # VIEW   — renders state, captures input, stats/history
│   ├── scene.ts          # 3D     — Three.js icosahedron, state → visuals
│   ├── main.ts           # composition root wiring the three layers
│   └── styles.css        # Tailwind entry + Signal palette CSS variables
├── tailwind.config.js    # maps palette variables into Tailwind utilities
├── vite.config.ts
└── tsconfig.json         # strict, no implicit any
```

---

## Key technical decisions

**`performance.now()`, never `Date.now()`, for measurement.**
`performance.now()` is a monotonic high-resolution clock that isn't affected by
system clock adjustments (NTP sync, DST). The stimulus moment is stamped with
it, and the response timestamp is captured on the *first line* of the input
handler — before any of our own work runs — so the measured value is the
reaction, not the framework overhead.

**`setTimeout` schedules the stimulus; it never measures.**
The only use of `setTimeout` is the randomized 2–5 s delay before "go". Timer
callbacks are not precise enough to measure against, so the actual duration is
always computed as `responseTime − stimulusTime` from `performance.now()`.

**Game state is a discriminated union.**
```ts
type GameState =
  | { status: 'idle' }
  | { status: 'waiting' }
  | { status: 'ready'; startTime: number }
  | { status: 'result'; reactionMs: number }
  | { status: 'falseStart' };
```
This makes impossible states unrepresentable — a `startTime` exists only in
`ready`, a `reactionMs` only in `result` — and the compiler forces every
consumer (UI and scene) to handle each case. No `any` anywhere; `tsconfig`
runs full `strict` plus `noUncheckedIndexedAccess`.

**The 3D scene is fully decoupled from game logic.**
`scene.ts` receives a `GameState` and maps each status to a visual *target*
(colour, emissive intensity, scale). All easing happens in the render loop, so
transitions stay smooth no matter when state changes arrive, and the scene can
be swapped or removed without touching a line of game code.

**Input stays precise regardless of render load.**
Input is handled on the DOM `pointerdown` event (lower latency than `click`,
and unified across mouse and touch), with the timestamp captured synchronously
at handler entry. Because that path is independent of the `requestAnimationFrame`
render loop, a heavy frame never delays the measurement.

**One palette, one source of truth.**
The Signal colours live as CSS variables in `styles.css`. Tailwind reads them
for the DOM, and `scene.ts` reads the *same* variables at runtime via
`getComputedStyle` to build its Three.js materials — so the 2D UI and the 3D
shape can never drift out of sync.

## Edge cases handled

- **False start** — clicking during `waiting` shows "too soon" and records no
  score.
- **Tab/window loses focus mid-wait** — background tabs throttle timers, which
  would corrupt a measurement, so any in-flight round is cancelled cleanly back
  to idle.
- **Rapid double-tap at "go"** — the first tap records the score; a second tap
  within a short guard window is ignored so it can't instantly launch a new
  round.
- **`localStorage` unavailable** — persistence fails silently; the session
  still works fully in memory.
- **Reduced motion** — the idle tumble and breathing pulse calm down when
  `prefers-reduced-motion` is set; state colours are unaffected.
