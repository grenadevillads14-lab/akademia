/**
 * Input: actions are bound to physical codes (KeyboardEvent.code, or "Mouse0".."Mouse4").
 * Game code only ever asks about *actions*, so everything is remappable.
 * Gamepad support arrives with the character controller (M1).
 *
 * `InputState` is pure (no DOM) so it can be unit-tested; `Input` attaches it to the page.
 */
export const ACTIONS = [
  'moveForward',
  'moveBack',
  'moveLeft',
  'moveRight',
  'moveUp',
  'moveDown',
  'sprint',
  'slow',
  'interact',
  'toggleDebugCamera',
  'toggleOverlay',
  'debugRespawn',
] as const;

export type Action = (typeof ACTIONS)[number];
export type Bindings = Record<Action, string[]>;

export const DEFAULT_BINDINGS: Bindings = {
  moveForward: ['KeyW', 'ArrowUp'],
  moveBack: ['KeyS', 'ArrowDown'],
  moveLeft: ['KeyA', 'ArrowLeft'],
  moveRight: ['KeyD', 'ArrowRight'],
  moveUp: ['KeyE', 'Space'],
  moveDown: ['KeyQ', 'ControlLeft'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  slow: ['AltLeft'],
  interact: ['KeyF'],
  toggleDebugCamera: ['F2'],
  toggleOverlay: ['F3', 'Backquote'],
  debugRespawn: ['KeyR'],
};

export function cloneBindings(b: Bindings): Bindings {
  const out = {} as Bindings;
  for (const a of ACTIONS) out[a] = [...b[a]];
  return out;
}

/** Codes that any binding uses; the DOM layer calls preventDefault on these (e.g. F3, Space). */
export function boundCodes(b: Bindings): Set<string> {
  const s = new Set<string>();
  for (const a of ACTIONS) for (const c of b[a]) s.add(c);
  return s;
}

export class InputState {
  private readonly down = new Set<string>();
  private readonly pressedThisFrame = new Set<string>();
  private bindings: Bindings;
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;

  constructor(bindings: Bindings = DEFAULT_BINDINGS) {
    this.bindings = cloneBindings(bindings);
  }

  keyDown(code: string): void {
    if (!this.down.has(code)) this.pressedThisFrame.add(code);
    this.down.add(code);
  }

  keyUp(code: string): void {
    this.down.delete(code);
  }

  mouseMove(dx: number, dy: number): void {
    this.mouseDX += dx;
    this.mouseDY += dy;
  }

  mouseWheel(dy: number): void {
    this.wheel += dy;
  }

  /** Release everything (window blur, pointer lock lost). */
  releaseAll(): void {
    this.down.clear();
  }

  isDown(action: Action): boolean {
    return this.bindings[action].some((c) => this.down.has(c));
  }

  wasPressed(action: Action): boolean {
    return this.bindings[action].some((c) => this.pressedThisFrame.has(c));
  }

  /** -1..1 from two opposing actions. */
  axis(negative: Action, positive: Action): number {
    return (this.isDown(positive) ? 1 : 0) - (this.isDown(negative) ? 1 : 0);
  }

  rebind(action: Action, codes: string[]): void {
    this.bindings[action] = [...codes];
  }

  getBindings(): Bindings {
    return cloneBindings(this.bindings);
  }

  /** Call once at the end of every rendered frame. */
  endFrame(): void {
    this.pressedThisFrame.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }
}

export class Input extends InputState {
  private locked = false;

  constructor(
    private readonly canvas: HTMLElement,
    bindings: Bindings = DEFAULT_BINDINGS,
  ) {
    super(bindings);
    const codes = () => boundCodes(this.getBindings());

    window.addEventListener('keydown', (e) => {
      if (codes().has(e.code)) e.preventDefault();
      this.keyDown(e.code);
    });
    window.addEventListener('keyup', (e) => this.keyUp(e.code));
    window.addEventListener('blur', () => this.releaseAll());
    canvas.addEventListener('mousedown', (e) => this.keyDown(`Mouse${e.button}`));
    window.addEventListener('mouseup', (e) => this.keyUp(`Mouse${e.button}`));
    window.addEventListener('mousemove', (e) => {
      if (this.locked) this.mouseMove(e.movementX, e.movementY);
    });
    canvas.addEventListener('wheel', (e) => this.mouseWheel(Math.sign(e.deltaY)), { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) this.releaseAll();
    });
  }

  get pointerLocked(): boolean {
    return this.locked;
  }

  requestPointerLock(): void {
    if (!this.locked) void this.canvas.requestPointerLock?.();
  }

  exitPointerLock(): void {
    if (this.locked) document.exitPointerLock();
  }
}
