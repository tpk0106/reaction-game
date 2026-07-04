/**
 * Core game logic — pure state + timing. No DOM, no Three.js, no framework.
 *
 * The whole game is modelled as a discriminated union so that impossible
 * states are unrepresentable: a `reactionMs` only exists in `result`, a
 * `startTime` only exists in `ready`. The compiler forces every consumer to
 * handle each case, which is what keeps the DOM and 3D layers honest.
 */
export type GameState =
  | { status: 'idle' }
  | { status: 'waiting' }
  | { status: 'ready'; startTime: number }
  | { status: 'result'; reactionMs: number }
  | { status: 'falseStart' };

export type GameStatus = GameState['status'];

export interface Attempt {
  reactionMs: number;
  /** Wall-clock time of the attempt, for display only (never for timing). */
  timestamp: number;
}

export interface Stats {
  best: number | null;
  average: number | null;
  count: number;
}

export interface EngineOptions {
  /** Minimum randomized delay before the stimulus (ms). */
  minDelayMs?: number;
  /** Maximum randomized delay before the stimulus (ms). */
  maxDelayMs?: number;
  /** localStorage key for optional persistence. `null` = memory only. */
  persistKey?: string | null;
}

type Listener = (state: GameState) => void;

const DEFAULT_MIN_DELAY = 2000;
const DEFAULT_MAX_DELAY = 5000;

/**
 * Guard window after a round ends. An accidental double-tap at the "go"
 * moment records one score (first tap) and would otherwise instantly launch
 * a new waiting round (second tap); this swallows that stray second tap.
 */
const REPLAY_GUARD_MS = 150;

export class GameEngine {
  private state: GameState = { status: 'idle' };
  private readonly listeners = new Set<Listener>();

  /** Handle for the randomized-delay timer. `setTimeout` schedules the
   *  stimulus ONLY; it is never used to measure reaction time. */
  private delayTimer: ReturnType<typeof setTimeout> | null = null;

  private attempts: Attempt[] = [];
  private lastStateChangeAt = 0;

  private readonly minDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly persistKey: string | null;

  constructor(options: EngineOptions = {}) {
    this.minDelayMs = options.minDelayMs ?? DEFAULT_MIN_DELAY;
    this.maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY;
    this.persistKey = options.persistKey ?? null;
    this.attempts = this.loadAttempts();
  }

  getState(): GameState {
    return this.state;
  }

  /**
   * Subscribe to state changes. The current state is emitted immediately so
   * new subscribers (UI, scene) paint correctly on mount. Returns an
   * unsubscribe function.
   */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setState(next: GameState): void {
    this.state = next;
    this.lastStateChangeAt = performance.now();
    for (const listener of this.listeners) listener(next);
  }

  /**
   * Single entry point for user input (click / tap / key).
   *
   * `now` must be captured on the FIRST line of the DOM event handler and
   * passed in, so the measurement excludes event-dispatch and call overhead.
   * It falls back to `performance.now()` for programmatic callers/tests.
   */
  handleInput(now: number = performance.now()): void {
    switch (this.state.status) {
      case 'idle':
        this.startRound();
        break;

      case 'result':
      case 'falseStart':
        // Ignore an immediate accidental second tap; require a small pause.
        if (now - this.lastStateChangeAt < REPLAY_GUARD_MS) return;
        this.startRound();
        break;

      case 'waiting':
        // Clicked before the stimulus — false start, no score recorded.
        this.clearDelay();
        this.setState({ status: 'falseStart' });
        break;

      case 'ready': {
        // The one measurement that matters. `startTime` was stamped with
        // performance.now() at the exact moment the stimulus appeared.
        const reactionMs = now - this.state.startTime;
        this.recordAttempt(reactionMs);
        this.setState({ status: 'result', reactionMs });
        break;
      }
    }
  }

  /** Begin a new round: enter `waiting`, then reveal the stimulus after a
   *  random delay the player cannot anticipate. */
  startRound(): void {
    this.clearDelay();
    this.setState({ status: 'waiting' });

    const delay = this.randomDelay();
    this.delayTimer = setTimeout(() => {
      this.delayTimer = null;
      // Stamp the stimulus moment with the high-resolution clock.
      this.setState({ status: 'ready', startTime: performance.now() });
    }, delay);
  }

  /**
   * Cancel an in-flight round without penalty. Used when the tab is hidden
   * or the window loses focus mid-wait, where continuing would produce a
   * meaningless (throttled) measurement.
   */
  abort(): void {
    if (this.state.status === 'waiting' || this.state.status === 'ready') {
      this.clearDelay();
      this.setState({ status: 'idle' });
    }
  }

  /** Force back to the idle state. */
  reset(): void {
    this.clearDelay();
    this.setState({ status: 'idle' });
  }

  private randomDelay(): number {
    return this.minDelayMs + Math.random() * (this.maxDelayMs - this.minDelayMs);
  }

  private clearDelay(): void {
    if (this.delayTimer !== null) {
      clearTimeout(this.delayTimer);
      this.delayTimer = null;
    }
  }

  // --- score history + stats -------------------------------------------------

  private recordAttempt(reactionMs: number): void {
    this.attempts.push({ reactionMs, timestamp: Date.now() });
    this.persistAttempts();
  }

  getAttempts(): readonly Attempt[] {
    return this.attempts;
  }

  getStats(): Stats {
    if (this.attempts.length === 0) {
      return { best: null, average: null, count: 0 };
    }
    let best = Infinity;
    let sum = 0;
    for (const attempt of this.attempts) {
      if (attempt.reactionMs < best) best = attempt.reactionMs;
      sum += attempt.reactionMs;
    }
    return {
      best,
      average: sum / this.attempts.length,
      count: this.attempts.length,
    };
  }

  clearHistory(): void {
    this.attempts = [];
    this.persistAttempts();
  }

  // --- optional localStorage persistence ------------------------------------

  private loadAttempts(): Attempt[] {
    if (!this.persistKey) return [];
    try {
      const raw = localStorage.getItem(this.persistKey);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isAttempt);
    } catch {
      return [];
    }
  }

  private persistAttempts(): void {
    if (!this.persistKey) return;
    try {
      localStorage.setItem(this.persistKey, JSON.stringify(this.attempts));
    } catch {
      // Storage unavailable or over quota — the session still works in memory.
    }
  }
}

function isAttempt(value: unknown): value is Attempt {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).reactionMs === 'number' &&
    typeof (value as Record<string, unknown>).timestamp === 'number'
  );
}
