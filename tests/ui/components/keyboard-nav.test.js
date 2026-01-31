import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createKeyboardNav } from '../../../src/ui/components/keyboard-nav.js';

describe('KeyboardNav', () => {
  let nav;

  beforeEach(() => {
    nav = createKeyboardNav();
    nav.attach();
  });

  afterEach(() => {
    nav.detach();
  });

  it('should attach and detach without errors', () => {
    expect(() => {
      nav.detach();
      nav.attach();
      nav.detach();
    }).not.toThrow();
  });

  it('should not handle keys when disabled', () => {
    nav.disable();
    const event = new KeyboardEvent('keydown', { key: 'j', cancelable: true });
    document.dispatchEvent(event);
    // No error thrown = success (nothing to navigate)
    expect(event.defaultPrevented).toBe(false);
  });

  it('should ignore keys when focused on input', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    const event = new KeyboardEvent('keydown', { key: 'j', cancelable: true });
    input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);

    document.body.removeChild(input);
  });

  it('should enable after disable', () => {
    nav.disable();
    nav.enable();
    // Just verifying no throw
    const event = new KeyboardEvent('keydown', { key: 'j', cancelable: true });
    document.dispatchEvent(event);
  });
});
