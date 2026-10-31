import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS, InputState, boundCodes } from '../../src/core/input';

describe('InputState', () => {
  it('maps keys to actions', () => {
    const input = new InputState();
    input.keyDown('KeyW');
    expect(input.isDown('moveForward')).toBe(true);
    expect(input.axis('moveBack', 'moveForward')).toBe(1);
    input.keyDown('KeyS');
    expect(input.axis('moveBack', 'moveForward')).toBe(0);
  });

  it('reports wasPressed only on the frame of the press', () => {
    const input = new InputState();
    input.keyDown('F2');
    expect(input.wasPressed('toggleDebugCamera')).toBe(true);
    input.endFrame();
    input.keyDown('F2'); // key repeat while held
    expect(input.wasPressed('toggleDebugCamera')).toBe(false);
    input.keyUp('F2');
    input.keyDown('F2');
    expect(input.wasPressed('toggleDebugCamera')).toBe(true);
  });

  it('supports rebinding without mutating the defaults', () => {
    const input = new InputState();
    input.rebind('moveForward', ['KeyZ']); // AZERTY
    input.keyDown('KeyW');
    expect(input.isDown('moveForward')).toBe(false);
    input.keyDown('KeyZ');
    expect(input.isDown('moveForward')).toBe(true);
    expect(DEFAULT_BINDINGS.moveForward).toContain('KeyW');
  });

  it('accumulates and clears mouse deltas', () => {
    const input = new InputState();
    input.mouseMove(3, -2);
    input.mouseMove(1, 1);
    expect([input.mouseDX, input.mouseDY]).toEqual([4, -1]);
    input.endFrame();
    expect([input.mouseDX, input.mouseDY]).toEqual([0, 0]);
  });

  it('releaseAll clears held keys', () => {
    const input = new InputState();
    input.keyDown('ShiftLeft');
    input.releaseAll();
    expect(input.isDown('sprint')).toBe(false);
  });

  it('lists every bound code', () => {
    const codes = boundCodes(DEFAULT_BINDINGS);
    expect(codes.has('F3')).toBe(true);
    expect(codes.has('Space')).toBe(true);
  });
});
