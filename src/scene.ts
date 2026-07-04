import * as THREE from 'three';
import type { GameState, GameStatus } from './game-state';

/**
 * The 3D view layer. It knows nothing about game rules or timing — it only
 * receives `GameState` and translates each status into a visual target
 * (colour, emissive glow, scale). All easing happens in the render loop so
 * transitions stay smooth and snappy regardless of when state changes land.
 *
 * Colours are read from the shared CSS variables, so the shape is guaranteed
 * to match the DOM's Signal palette exactly.
 */

interface Palette {
  idle: THREE.Color;
  waiting: THREE.Color;
  ready: THREE.Color;
  falseStart: THREE.Color;
  result: THREE.Color;
  edge: THREE.Color;
}

interface StateTarget {
  color: THREE.Color;
  emissive: number;
  scale: number;
}

function cssColor(variable: string, fallback: string): THREE.Color {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(variable)
    .trim();
  return new THREE.Color(raw || fallback);
}

export class ReactionScene {
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly mesh: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshStandardMaterial>;
  private readonly palette: Palette;
  private readonly targets: Record<GameStatus, StateTarget>;
  private readonly reduceMotion: boolean;
  private readonly clock = new THREE.Clock();
  private readonly resizeObserver: ResizeObserver;

  private status: GameStatus = 'idle';
  private target: StateTarget;
  private currentScale = 1;
  private popImpulse = 0; // sharp scale burst fired at the "go" moment
  private frameId = 0;

  constructor(container: HTMLElement) {
    this.container = container;
    this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.palette = {
      idle: cssColor('--color-accent', '#6366f1'),
      waiting: cssColor('--color-waiting', '#dc4f4f'),
      ready: cssColor('--color-ready', '#3ecf8e'),
      falseStart: cssColor('--color-false-start', '#f5a623'),
      result: cssColor('--color-accent-hover', '#818cf8'),
      edge: cssColor('--color-bg', '#0a0e14'),
    };

    // Each status maps to a visual target. Waiting sits a touch smaller and
    // dim; ready pops bigger and blazes; false start flares amber.
    this.targets = {
      idle: { color: this.palette.idle, emissive: 0.25, scale: 1.0 },
      waiting: { color: this.palette.waiting, emissive: 0.4, scale: 0.92 },
      ready: { color: this.palette.ready, emissive: 1.5, scale: 1.16 },
      falseStart: { color: this.palette.falseStart, emissive: 0.85, scale: 1.0 },
      result: { color: this.palette.result, emissive: 0.55, scale: 1.06 },
    };
    this.target = this.targets.idle;

    // --- renderer / scene / camera ---
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight, false);
    this.renderer.domElement.style.display = 'block';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      45,
      this.aspect(),
      0.1,
      100,
    );
    this.camera.position.set(0, 0, 5);

    // --- the one primary shape: a flat-shaded icosahedron ---
    const geometry = new THREE.IcosahedronGeometry(1.35, 0);
    const material = new THREE.MeshStandardMaterial({
      color: this.palette.idle.clone(),
      emissive: this.palette.idle.clone(),
      emissiveIntensity: this.target.emissive,
      metalness: 0.1,
      roughness: 0.35,
      flatShading: true,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.mesh);

    // Subtle dark wireframe overlay sharpens the facets — a small, deliberate
    // "technical" signature that reads well in a portfolio.
    const wireframe = new THREE.LineSegments(
      new THREE.WireframeGeometry(geometry),
      new THREE.LineBasicMaterial({
        color: this.palette.edge,
        transparent: true,
        opacity: 0.3,
      }),
    );
    this.mesh.add(wireframe);

    // --- lighting: minimal, predictable across three.js versions ---
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(3, 4, 5);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.6);
    fill.position.set(-4, -2, 3);
    this.scene.add(fill);

    // --- responsiveness ---
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(container);

    this.frameId = requestAnimationFrame(this.animate);
  }

  /** Translate a game state into the scene's visual target. */
  setStatus(state: GameState): void {
    const previous = this.status;
    this.status = state.status;
    this.target = this.targets[state.status];
    // Fire the burst only on the transition INTO ready, not on repaint.
    if (state.status === 'ready' && previous !== 'ready') {
      this.popImpulse = 1;
    }
  }

  private aspect(): number {
    const h = this.container.clientHeight || 1;
    return this.container.clientWidth / h;
  }

  private readonly animate = (): void => {
    this.frameId = requestAnimationFrame(this.animate);

    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    const material = this.mesh.material;

    // Idle motion: a slow, continuous tumble. Calmed if reduced motion is on.
    const spin = this.reduceMotion ? 0.12 : 0.6;
    this.mesh.rotation.y += dt * spin;
    this.mesh.rotation.x += dt * spin * 0.4;

    // Ease colour + emissive toward the current target. exp() easing is
    // frame-rate independent, so it feels identical at 60Hz and 144Hz.
    const colorEase = 1 - Math.exp(-dt * 14);
    const glowEase = 1 - Math.exp(-dt * 12);
    material.color.lerp(this.target.color, colorEase);
    material.emissive.lerp(this.target.color, colorEase);
    material.emissiveIntensity +=
      (this.target.emissive - material.emissiveIntensity) * glowEase;

    // Scale: base target + gentle "breathing" while waiting + decaying pop.
    const breathing =
      this.status === 'waiting' && !this.reduceMotion ? Math.sin(t * 2.2) * 0.02 : 0;
    const scaleTarget = this.target.scale + breathing + this.popImpulse * 0.25;
    this.currentScale += (scaleTarget - this.currentScale) * (1 - Math.exp(-dt * 18));
    this.popImpulse *= Math.exp(-dt * 8);
    this.mesh.scale.setScalar(this.currentScale);

    this.renderer.render(this.scene, this.camera);
  };

  private onResize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  /** Release GPU resources — good hygiene for a portfolio review. */
  dispose(): void {
    cancelAnimationFrame(this.frameId);
    this.resizeObserver.disconnect();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.children.forEach((child) => {
      if (child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
