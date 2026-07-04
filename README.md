# Reaction Timer

A minimalist reaction-time game with a procedural Three.js centerpiece. No framework, no backend — plain TypeScript, the DOM, and a single WebGL shape. Everything runs client-side and builds to a static `HTML/CSS/JS` bundle.

**Stack:** Vanilla TypeScript · Three.js · Tailwind CSS · Vite · Web Audio API

---

## Table of contents

- [Installation & setup](#installation--setup)
- [Running the project](#running-the-project)
- [Building for production](#building-for-production)
- [Architecture](#architecture)
- [Color system — "Signal" palette](#color-system--signal-palette)
- [Typography](#typography)
- [Reaction time ratings](#reaction-time-ratings)
- [Sound design](#sound-design)
- [Favicon / branding](#favicon--branding)
- [Key technical decisions](#key-technical-decisions)
- [Edge cases handled](#edge-cases-handled)
- [Changelog](#changelog)

---

## Installation & setup

Requires **Node.js 18+** and npm.

```bash
# 1. Clone or unzip the project, then move into it
cd reaction-game

# 2. Install dependencies
npm install
```

Make sure `caesar.png` is present in the project root (same folder as `index.html`) — it's referenced as the favicon and won't 404 as long as it stays there.

No environment variables, no API keys, no backend to configure — this is a fully static, client-side project.

---

## Running the project

```bash
npm run dev
```

Starts the Vite dev server, by default at **http://localhost:5173**. Hot-reloads on any change to `src/` or `index.html`.

---

## Building for production

```bash
npm run build     # type-checks with tsc, then bundles to dist/
npm run preview   # serves the built dist/ locally, to sanity-check before deploying
```

Deploy the contents of `dist/` to any static host — GitHub Pages, Netlify, Vercel, S3, etc. `vite.config.ts` sets `base: './'` so asset paths stay relative, meaning it also works when served from a subfolder (e.g. `yoursite.com/projects/reaction-timer/`).

---

## Architecture

Three clean layers with a one-way data flow. `GameEngine` is the single source of truth; the DOM view and the 3D scene are pure subscribers that never contain game logic themselves.

```
pointer / key ─▶ ui.ts ─▶ engine.handleInput(now) ─▶ new GameState ─▶ ui + scene + sound
```

```
reaction-game/
├── index.html            # semantic markup, mounts the scene + readout + favicon
├── caesar.png             # favicon / header brand mark
├── src/
│   ├── game-state.ts     # STATE  — state machine, timing, stats, rating bands (no DOM/GL)
│   ├── ui.ts             # VIEW   — renders state, captures input, stats/history/rating
│   ├── scene.ts          # 3D     — Three.js icosahedron, state → visuals
│   ├── sound.ts          # AUDIO  — Web Audio tones for false starts + result ratings
│   ├── main.ts           # composition root wiring engine ▸ ui ▸ scene ▸ sound
│   └── styles.css        # Tailwind entry + Signal palette CSS variables
├── tailwind.config.js    # maps palette variables into Tailwind utilities
├── vite.config.ts
├── postcss.config.js
└── tsconfig.json         # strict, no implicit any
```

Each layer only knows about `GameState` — never about each other. `ui.ts` doesn't know `scene.ts` exists; `sound.ts` doesn't know the DOM exists. This means any one layer (say, the 3D scene) could be deleted or swapped without touching game logic or breaking the others.

---

## Color system — "Signal" palette

All colors are defined once, as CSS variables in `src/styles.css`, and consumed from there by both Tailwind (DOM) and `scene.ts` (Three.js materials via `getComputedStyle`) — so the 2D UI and the 3D shape can never drift out of sync.

| Token                  | Hex       | Usage                                              |
| ---------------------- | --------- | -------------------------------------------------- |
| `--color-bg`           | `#0A0E14` | Primary page background                            |
| `--color-surface`      | `#141922` | Play area / card backgrounds                       |
| `--color-text`         | `#F4F6F8` | Primary text                                       |
| `--color-text-muted`   | `#8B93A1` | Secondary text, labels, timestamps                 |
| `--color-waiting`      | `#DC4F4F` | "Wait" state — red                                 |
| `--color-ready`        | `#3ECF8E` | "Go" state / Excellent & Very Good ratings — green |
| `--color-false-start`  | `#F5A623` | False start / Below Average rating — amber         |
| `--color-accent`       | `#6366F1` | Primary buttons, links, Good rating — indigo       |
| `--color-accent-hover` | `#818CF8` | Hover / focus glow — light indigo                  |

To retheme the whole app, change the hex values in `:root` inside `src/styles.css` — nothing else needs to be touched.

---

## Typography

| Role                  | Font                                                                       |
| --------------------- | -------------------------------------------------------------------------- |
| Headings / UI labels  | Space Grotesk                                                              |
| Body / secondary text | Inter                                                                      |
| Reaction time readout | JetBrains Mono (tabular figures — prevents digit jitter as numbers change) |

Loaded via Google Fonts in `src/styles.css`.

---

## Reaction time ratings

Every completed round is classified into a tier, shown next to the result and in the history list, colored per the palette above. Thresholds live as named constants in `src/game-state.ts` (`RATING_THRESHOLDS_MS`) rather than scattered magic numbers, so they're easy to tune.

| Rating            | Reaction time | Color                         |
| ----------------- | ------------- | ----------------------------- |
| **Excellent**     | < 200ms       | Green (`--color-ready`)       |
| **Very Good**     | 200ms – 250ms | Green (`--color-ready`)       |
| **Good**          | 250ms – 350ms | Indigo (`--color-accent`)     |
| **Below Average** | > 350ms       | Amber (`--color-false-start`) |

Classification logic:

```ts
// src/game-state.ts
export function getRatingForTime(reactionMs: number): Rating {
  if (reactionMs < RATING_THRESHOLDS_MS.excellent) return "Excellent";
  if (reactionMs < RATING_THRESHOLDS_MS.veryGood) return "Very Good";
  if (reactionMs < RATING_THRESHOLDS_MS.good) return "Good";
  return "Below Average";
}
```

Ratings are stored on each `Attempt` at the moment it's recorded, so a rating never needs to be recomputed for history/stats — and legacy attempts saved to `localStorage` before this feature existed are backfilled with a computed rating on load.

---

## Sound design

Implemented in `src/sound.ts` using the **Web Audio API** — tones are synthesized with oscillators rather than loaded audio files, so there are no binary assets to source, license, or ship. This keeps the project dependency-light, consistent with the procedural approach already used for the Three.js shape.

| Trigger                             | Sound                                                           |
| ----------------------------------- | --------------------------------------------------------------- |
| **False start** (clicked too early) | Harsh double buzz — two quick square-wave tones (220Hz → 180Hz) |
| **Result: Excellent**               | Bright ascending sine chime (660Hz → 880Hz)                     |
| **Result: Very Good**               | Ascending sine chime, slightly lower (587Hz → 740Hz)            |
| **Result: Good**                    | Single neutral triangle-wave tone (523Hz)                       |
| **Result: Below Average**           | Low, dull sawtooth tone (392Hz)                                 |

`AudioContext` is created lazily on first use and resumed if suspended — since every sound call originates from a click/tap handler already in the game loop, this satisfies the browser requirement that audio starts only after a user gesture, with no extra "enable sound" step needed.

To add a new sound, add a method to `SoundEngine` in `src/sound.ts` and call it from the relevant branch in `main.ts`'s `engine.subscribe(...)` callback — the same place the existing sounds are wired in.

---

## Favicon / branding

`caesar.png`, in the project root, is referenced in `index.html`:

```html
<link rel="icon" type="image/png" href="/caesar.png" />
```

Keep the file at the project root (not inside `src/`) since it's referenced by an absolute path from the site root.

---

## Key technical decisions

**`performance.now()`, never `Date.now()`, for measurement.**
`performance.now()` is a monotonic high-resolution clock unaffected by system clock adjustments (NTP sync, DST). The stimulus moment is stamped with it, and the response timestamp is captured on the _first line_ of the input handler — before any of our own code runs — so the measured value is the reaction time, not framework/handler overhead.

**`setTimeout` schedules the stimulus; it never measures.**
The only use of `setTimeout` is the randomized 2–5s delay before "go". Timer callbacks aren't precise enough to measure against, so the actual duration is always computed as `responseTime − stimulusTime`, both taken from `performance.now()`.

**Game state is a discriminated union.**

```ts
type GameState =
  | { status: "idle" }
  | { status: "waiting" }
  | { status: "ready"; startTime: number }
  | { status: "result"; reactionMs: number }
  | { status: "falseStart" };
```

This makes impossible states unrepresentable — a `startTime` exists only in `ready`, a `reactionMs` only in `result` — and the compiler forces every consumer (UI, scene, sound) to handle each case. `tsconfig.json` runs full `strict` mode.

**The 3D scene is fully decoupled from game logic.**
`scene.ts` receives a `GameState` and maps each status to a visual target (color, emissive intensity, scale). Easing happens in the render loop, so transitions stay smooth regardless of when state changes arrive, and the scene could be swapped or removed without touching a line of game code.

**Sound is decoupled the same way.**
`sound.ts` exposes `playFalseStart()` and `playResult(rating)` and knows nothing about `GameState`, the DOM, or Three.js — `main.ts` is the only place that connects state transitions to sound calls.

**Input stays precise regardless of render load.**
Input is handled on the DOM `pointerdown` event (lower latency than `click`, unified across mouse and touch), with the timestamp captured synchronously at handler entry. Because that path is independent of the `requestAnimationFrame` render loop, a heavy frame never delays the measurement.

**One palette, one source of truth.**
The Signal colors live as CSS variables in `styles.css`. Tailwind reads them for the DOM, and `scene.ts` reads the _same_ variables at runtime via `getComputedStyle` to build its Three.js materials — so the 2D UI and the 3D shape can never drift out of sync.

---

## Edge cases handled

- **False start** — clicking during `waiting` shows "too soon", plays the alarm sound, and records no score.
- **Tab/window loses focus mid-wait** — background tabs throttle timers, which would corrupt a measurement, so any in-flight round is cancelled cleanly back to idle.
- **Rapid double-tap at "go"** — the first tap records the score; a second tap within a short guard window (150ms) is ignored so it can't instantly launch a new round.
- **`localStorage` unavailable or attempts saved before ratings existed** — persistence fails silently (session still works in memory), and old attempts are backfilled with a computed rating on load.
- **Reduced motion** — the idle tumble and breathing pulse calm down when `prefers-reduced-motion` is set; state colors are unaffected.

---

## Changelog

- **Favicon** — `caesar.png` wired up as the site favicon via `index.html`.
- **Reaction time ratings** — Excellent / Very Good / Good / Below Average tiers added, computed by `getRatingForTime()` in `game-state.ts`, displayed next to the live result and in the attempt history, each attempt's rating persisted alongside its score.
- **Sound** — `sound.ts` added: a false-start buzz and four result chimes (one per rating tier), synthesized via the Web Audio API, triggered from `main.ts`'s state subscription.
