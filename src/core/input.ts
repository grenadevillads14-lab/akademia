/**
 * Input: actions are bound to physical codes (KeyboardEvent.code, "Mouse0".."Mouse4", or gamepad
 * buttons "Pad0".."Pad16" in the standard mapping: 0 A/Cross, 1 B/Circle, 2 X/Square, 3 Y/Triangle,
 * 4 LB, 5 RB, 6 LT, 7 RT, 8 Back/Select, 9 Start, 10 L3, 11 R3, 12–15 D-pad).
 * Game code only ever asks about *actions* (plus analog move/look axes), so everything is remappable.
 *
 * `InputState` is pure (no DOM) so it can be unit-tested; `Input` attaches it to the page and polls gamepads.
 */
export const ACTIONS = [
  'moveForward',
  'moveBack',
  'moveLeft',
  'moveRight',
  'moveUp',
  'moveDown',
  'sprint',
  'walk',
  'slow',
  'jump',
  'interact',
  'journal',
  'map',
  'pause',
  'photo',
  'confirm',
  'cancel',
  'toggleDebugCamera',
  'toggleOverlay',
  'debugRespawn',
  'debugTime',
] as const;

export type Action = (typeof ACTIONS)[number];
export type Bindings = Record<Action, string[]>;

export const DEFAULT_BINDINGS: Bindings = {
  moveForward: ['KeyW', 'ArrowUp', 'Pad12'],
  moveBack: ['KeyS', 'ArrowDown', 'Pad13'],
  moveLeft: ['KeyA', 'ArrowLeft', 'Pad14'],
  moveRight: ['KeyD', 'ArrowRight', 'Pad15'],
  moveUp: ['KeyE'],
  moveDown: ['KeyQ'],
  sprint: ['ShiftLeft', 'ShiftRight', 'Pad10', 'Pad1'],
  walk: ['ControlLeft', 'CapsLock'],
  slow: ['AltLeft'],
  jump: ['Space', 'Pad0'],
  interact: ['KeyF', 'Pad2'],
  journal: ['KeyJ', 'Tab', 'Pad3'],
  map: ['KeyM', 'Pad8'],
  pause: ['Escape', 'KeyP', 'Pad9'],
  photo: ['KeyH', 'Pad11'],
  confirm: ['Enter', 'Space', 'Pad0'],
  cancel: ['Escape', 'Backspace', 'Pad1'],
  toggleDebugCamera: ['F2'],
  toggleOverlay: ['F3', 'Backquote'],
  debugRespawn: ['F4'],
  debugTime: ['F6'],
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
  /** Analog axes from a gamepad, -1..1 (x right, y forward for move; x right, y down for look). */
  padMoveX = 0;
  padMoveY = 0;
  padLookX = 0;
  padLookY = 0;
  /** Last device used, for UI prompts ("F" vs "X"). */
  lastDevice: 'keyboard' | 'gamepad' = 'keyboard';

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

  /** Raw physical code pressed this frame (e.g. "Digit1"), for UI that isn't action-bound. */
  wasCodePressed(code: string): boolean {
    return this.pressedThisFrame.has(code);
  }

  wasPressed(action: Action): boolean {
    return this.bindings[action].some((c) => this.pressedThisFrame.has(c));
  }

  /** -1..1 from two opposing actions. */
  axis(negative: Action, positive: Action): number {
    return (this.isDown(positive) ? 1 : 0) - (this.isDown(negative) ? 1 : 0);
  }

  /** Movement vector combining keys and the left stick; x right, y forward; length ≤ 1. */
  move(): { x: number; y: number } {
    let x = this.axis('moveLeft', 'moveRight') + this.padMoveX;
    let y = this.axis('moveBack', 'moveForward') + this.padMoveY;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
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
      // Let typing in text fields (save names, character name) work normally.
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (codes().has(e.code) && e.code !== 'Escape') e.preventDefault();
      this.keyDown(e.code);
      this.lastDevice = 'keyboard';
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

  private padDown = new Set<string>();

  /** Poll connected gamepads (call once per frame before reading input). */
  pollGamepads(): void {
    const pads = navigator.getGamepads?.() ?? [];
    const pad = pads.find((p) => p && p.connected);
    if (!pad) {
      this.padMoveX = this.padMoveY = this.padLookX = this.padLookY = 0;
      return;
    }
    const dz = (v: number) => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85);
    this.padMoveX = dz(pad.axes[0] ?? 0);
    this.padMoveY = -dz(pad.axes[1] ?? 0);
    this.padLookX = dz(pad.axes[2] ?? 0);
    this.padLookY = dz(pad.axes[3] ?? 0);
    pad.buttons.forEach((b, i) => {
      const code = `Pad${i}`;
      const pressed = b.pressed || b.value > 0.5;
      if (pressed && !this.padDown.has(code)) {
        this.padDown.add(code);
        this.keyDown(code);
        this.lastDevice = 'gamepad';
      } else if (!pressed && this.padDown.has(code)) {
        this.padDown.delete(code);
        this.keyUp(code);
      }
    });
    if (Math.abs(this.padMoveX) + Math.abs(this.padMoveY) + Math.abs(this.padLookX) + Math.abs(this.padLookY) > 0) this.lastDevice = 'gamepad';
  }

  requestPointerLock(): void {
    if (!this.locked) void this.canvas.requestPointerLock?.();
  }

  exitPointerLock(): void {
    if (this.locked) document.exitPointerLock();
  }
}
