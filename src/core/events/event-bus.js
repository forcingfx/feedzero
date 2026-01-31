/**
 * Simple pub/sub event bus with wildcard support.
 * Returns unsubscribe functions for easy cleanup.
 */
export function createEventBus() {
  const listeners = new Map();

  function on(event, callback) {
    if (!listeners.has(event)) {
      listeners.set(event, new Set());
    }
    listeners.get(event).add(callback);
    return () => off(event, callback);
  }

  function off(event, callback) {
    const set = listeners.get(event);
    if (set) {
      set.delete(callback);
      if (set.size === 0) listeners.delete(event);
    }
  }

  function emit(event, data) {
    const set = listeners.get(event);
    if (set) {
      for (const cb of set) cb(data, event);
    }
    // Wildcard listeners
    const wildcard = listeners.get('*');
    if (wildcard) {
      for (const cb of wildcard) cb(data, event);
    }
  }

  function clear() {
    listeners.clear();
  }

  return { on, off, emit, clear };
}
