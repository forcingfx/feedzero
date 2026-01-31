import { describe, it, expect, vi } from 'vitest';
import { createEventBus } from '../../../src/core/events/event-bus.js';

describe('EventBus', () => {
  it('should call listener when event is emitted', () => {
    const bus = createEventBus();
    const cb = vi.fn();
    bus.on('test', cb);
    bus.emit('test', { value: 1 });
    expect(cb).toHaveBeenCalledWith({ value: 1 }, 'test');
  });

  it('should support multiple listeners per event', () => {
    const bus = createEventBus();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    bus.on('test', cb1);
    bus.on('test', cb2);
    bus.emit('test', 'data');
    expect(cb1).toHaveBeenCalledOnce();
    expect(cb2).toHaveBeenCalledOnce();
  });

  it('should not call listener after off', () => {
    const bus = createEventBus();
    const cb = vi.fn();
    bus.on('test', cb);
    bus.off('test', cb);
    bus.emit('test', 'data');
    expect(cb).not.toHaveBeenCalled();
  });

  it('should return unsubscribe function from on()', () => {
    const bus = createEventBus();
    const cb = vi.fn();
    const unsub = bus.on('test', cb);
    unsub();
    bus.emit('test', 'data');
    expect(cb).not.toHaveBeenCalled();
  });

  it('should support wildcard listeners', () => {
    const bus = createEventBus();
    const cb = vi.fn();
    bus.on('*', cb);
    bus.emit('feed:added', { id: 1 });
    bus.emit('article:read', { id: 2 });
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenCalledWith({ id: 1 }, 'feed:added');
    expect(cb).toHaveBeenCalledWith({ id: 2 }, 'article:read');
  });

  it('should not call listeners for different events', () => {
    const bus = createEventBus();
    const cb = vi.fn();
    bus.on('a', cb);
    bus.emit('b', 'data');
    expect(cb).not.toHaveBeenCalled();
  });

  it('should handle off for non-existent event gracefully', () => {
    const bus = createEventBus();
    expect(() => bus.off('nope', () => {})).not.toThrow();
  });

  it('should clear all listeners', () => {
    const bus = createEventBus();
    const cb = vi.fn();
    bus.on('a', cb);
    bus.on('b', cb);
    bus.clear();
    bus.emit('a');
    bus.emit('b');
    expect(cb).not.toHaveBeenCalled();
  });
});
