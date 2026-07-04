import type { Attempt, GameState, GameStatus, Stats } from './game-state';

/**
 * The DOM view layer. It renders `GameState` into the page and forwards user
 * input back out through callbacks. It owns no game logic — it never decides
 * what a click *means*, only captures the timestamp and reports it.
 */

export interface UICallbacks {
  /** Fired on every click/tap/key on the play surface. `now` is captured on
   *  the first line of the handler for measurement accuracy. */
  onInput: (now: number) => void;
  onClearHistory: () => void;
}

const STATUS_MESSAGE: Record<GameStatus, string> = {
  idle: 'Click anywhere to start',
  waiting: 'Wait for green…',
  ready: 'Click now!',
  result: 'Nice — click to go again',
  falseStart: 'Too soon. Click to retry',
};

const BUTTON_LABEL: Record<GameStatus, string> = {
  idle: 'Start',
  waiting: 'Waiting…',
  ready: 'Click!',
  result: 'Try again',
  falseStart: 'Try again',
};

function formatMs(ms: number): string {
  return `${Math.round(ms)} ms`;
}

function requireEl<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`Missing required element: ${selector}`);
  return el;
}

export class GameUI {
  private readonly playArea: HTMLElement;
  private readonly readout: HTMLElement;
  private readonly statusMessage: HTMLElement;
  private readonly actionButton: HTMLButtonElement;
  private readonly clearButton: HTMLButtonElement;
  private readonly statBest: HTMLElement;
  private readonly statAverage: HTMLElement;
  private readonly statCount: HTMLElement;
  private readonly historyList: HTMLOListElement;
  private readonly historyEmpty: HTMLElement;

  constructor(root: Document, private readonly callbacks: UICallbacks) {
    this.playArea = requireEl<HTMLElement>(root, '#play-area');
    this.readout = requireEl<HTMLElement>(root, '#readout');
    this.statusMessage = requireEl<HTMLElement>(root, '#status-message');
    this.actionButton = requireEl<HTMLButtonElement>(root, '#action-button');
    this.clearButton = requireEl<HTMLButtonElement>(root, '#clear-button');
    this.statBest = requireEl<HTMLElement>(root, '#stat-best');
    this.statAverage = requireEl<HTMLElement>(root, '#stat-average');
    this.statCount = requireEl<HTMLElement>(root, '#stat-count');
    this.historyList = requireEl<HTMLOListElement>(root, '#history-list');
    this.historyEmpty = requireEl<HTMLElement>(root, '#history-empty');

    this.bindInput();
  }

  getSceneContainer(): HTMLElement {
    return requireEl<HTMLElement>(document, '#scene-container');
  }

  private bindInput(): void {
    // `pointerdown` is the lowest-latency unified mouse+touch signal, and it
    // fires before `click`. Stamp the time on the very first line so the
    // measurement excludes our own handler work.
    this.playArea.addEventListener('pointerdown', (event) => {
      const now = performance.now();
      event.preventDefault();
      this.callbacks.onInput(now);
    });

    // Keyboard parity: Space / Enter act as the response when the area is
    // focused. `role="button"` + `tabindex="0"` on the element make it reachable.
    this.playArea.addEventListener('keydown', (event) => {
      if (event.code === 'Space' || event.code === 'Enter') {
        const now = performance.now();
        event.preventDefault();
        this.callbacks.onInput(now);
      }
    });

    // The button is a convenience control. `click` keeps it fully keyboard-
    // and screen-reader-friendly; its latency is irrelevant since it's used
    // to start/replay, not to catch the stimulus.
    this.actionButton.addEventListener('click', () => {
      this.callbacks.onInput(performance.now());
    });

    this.clearButton.addEventListener('click', () => this.callbacks.onClearHistory());
  }

  render(state: GameState): void {
    this.statusMessage.textContent = STATUS_MESSAGE[state.status];
    this.actionButton.textContent = BUTTON_LABEL[state.status];

    switch (state.status) {
      case 'idle':
        this.setReadout('—', 'var(--color-text)');
        break;
      case 'waiting':
        this.setReadout('•••', 'var(--color-waiting)');
        break;
      case 'ready':
        this.setReadout('GO', 'var(--color-ready)');
        break;
      case 'result':
        this.setReadout(formatMs(state.reactionMs), 'var(--color-ready)');
        break;
      case 'falseStart':
        this.setReadout('Too soon', 'var(--color-false-start)');
        break;
    }
  }

  private setReadout(text: string, color: string): void {
    this.readout.textContent = text;
    this.readout.style.color = color;
  }

  renderStats(stats: Stats): void {
    this.statBest.textContent = stats.best === null ? '—' : formatMs(stats.best);
    this.statAverage.textContent =
      stats.average === null ? '—' : formatMs(stats.average);
    this.statCount.textContent = String(stats.count);
  }

  renderHistory(attempts: readonly Attempt[]): void {
    const hasAttempts = attempts.length > 0;
    this.historyEmpty.hidden = hasAttempts;
    this.historyList.hidden = !hasAttempts;
    this.historyList.replaceChildren();
    if (!hasAttempts) return;

    const best = attempts.reduce(
      (min, a) => (a.reactionMs < min ? a.reactionMs : min),
      Infinity,
    );

    // Most recent first, capped so the list stays glanceable.
    const recent = attempts.slice(-8).reverse();
    for (const attempt of recent) {
      const isBest = attempt.reactionMs === best;
      const item = document.createElement('li');
      item.className = 'flex items-center justify-between rounded px-2 py-1';
      if (isBest) item.style.color = 'var(--color-ready)';

      const time = document.createElement('span');
      time.className = 'text-text-muted';
      time.textContent = new Date(attempt.timestamp).toLocaleTimeString();

      const value = document.createElement('span');
      value.className = 'font-semibold';
      value.textContent = isBest
        ? `${formatMs(attempt.reactionMs)} ★`
        : formatMs(attempt.reactionMs);

      item.append(time, value);
      this.historyList.appendChild(item);
    }
  }
}
