import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/core/events';

interface TestEvents {
  ping: { n: number };
  other: string;
}

describe('EventBus', () => {
  it('delivers typed payloads to subscribers', () => {
    const bus = new EventBus<TestEvents>();
    const fn = vi.fn();
    bus.on('ping', fn);
    bus.emit('ping', { n: 3 });
    expect(fn).toHaveBeenCalledWith({ n: 3 });
  });

  it('unsubscribes via the returned function', () => {
    const bus = new EventBus<TestEvents>();
    const fn = vi.fn();
    const off = bus.on('other', fn);
    off();
    bus.emit('other', 'x');
    expect(fn).not.toHaveBeenCalled();
    expect(bus.listenerCount('other')).toBe(0);
  });

  it('once fires a single time', () => {
    const bus = new EventBus<TestEvents>();
    const fn = vi.fn();
    bus.once('ping', fn);
    bus.emit('ping', { n: 1 });
    bus.emit('ping', { n: 2 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('isolates a throwing handler from the others', () => {
    const bus = new EventBus<TestEvents>();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const good = vi.fn();
    bus.on('ping', () => {
      throw new Error('boom');
    });
    bus.on('ping', good);
    bus.emit('ping', { n: 1 });
    expect(good).toHaveBeenCalled();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('lets handlers unsubscribe during emit', () => {
    const bus = new EventBus<TestEvents>();
    const second = vi.fn();
    const off = bus.on('ping', () => off());
    bus.on('ping', second);
    bus.emit('ping', { n: 1 });
    expect(second).toHaveBeenCalledTimes(1);
    expect(bus.listenerCount('ping')).toBe(1);
  });
});
