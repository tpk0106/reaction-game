import "../src/styles.css";
import { GameEngine, getRatingForTime } from "./game-state";
import { GameUI } from "./ui";
import { ReactionScene } from "./scene";
import { soundEngine } from "./sound";

/**
 * Composition root. The engine is the single source of truth; the UI and the
 * scene are both pure subscribers that react to state. Input flows one way:
 *   pointer/key  ->  UI  ->  engine.handleInput(now)  ->  new state  ->  UI + scene
 */
function bootstrap(): void {
  const engine = new GameEngine({ persistKey: "reaction-timer:attempts:v1" });

  const ui = new GameUI(document, {
    onInput: (now) => engine.handleInput(now),
    onClearHistory: () => {
      engine.clearHistory();
      ui.renderStats(engine.getStats());
      ui.renderHistory(engine.getAttempts());
    },
  });

  const scene = new ReactionScene(ui.getSceneContainer());

  engine.subscribe((state) => {
    ui.render(state);
    scene.setStatus(state);
    // Stats/history only change when a round completes with a score.
    if (state.status === "result") {
      ui.renderStats(engine.getStats());
      ui.renderHistory(engine.getAttempts());
      soundEngine.playResult(getRatingForTime(state.reactionMs));
    }
    if (state.status === "falseStart") {
      soundEngine.playFalseStart();
    }
  });

  // Initial paint of any persisted attempts loaded from localStorage.
  ui.renderStats(engine.getStats());
  ui.renderHistory(engine.getAttempts());

  // Losing focus mid-wait would corrupt timing (background tabs throttle
  // timers), so cancel any in-flight round cleanly instead of recording junk.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) engine.abort();
  });
  window.addEventListener("blur", () => engine.abort());

  // Free GPU resources if the page is torn down.
  window.addEventListener("pagehide", () => scene.dispose());
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
