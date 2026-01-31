/**
 * Keyboard navigation manager.
 * j/k: navigate lists, Enter: select, Escape: go back, ?: show help
 */

export function createKeyboardNav() {
  let active = true;

  function handleKeydown(e) {
    if (!active) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const handlers = {
      j: () => moveFocus(1),
      k: () => moveFocus(-1),
      Enter: () => activateFocused(),
      Escape: () => goBack(),
    };

    const handler = handlers[e.key];
    if (handler) {
      e.preventDefault();
      handler();
    }
  }

  function moveFocus(direction) {
    const focused = document.activeElement;
    const shadowRoot = focused?.shadowRoot || focused?.closest?.('[role="listbox"]')?.getRootNode();

    // Find the active listbox
    let listbox = null;
    for (const el of document.querySelectorAll('feed-list, article-list')) {
      const lb = el.shadowRoot?.querySelector('[role="listbox"]');
      if (lb && lb.children.length > 0) {
        // Prefer the listbox that has focus within it
        if (el.shadowRoot?.activeElement || el.contains(document.activeElement)) {
          listbox = lb;
          break;
        }
        if (!listbox) listbox = lb;
      }
    }

    if (!listbox) return;

    const items = [...listbox.querySelectorAll('[role="option"]')];
    if (items.length === 0) return;

    const currentIndex = items.findIndex((el) => el === listbox.getRootNode().activeElement);
    const nextIndex = Math.max(0, Math.min(items.length - 1, currentIndex + direction));
    items[nextIndex].focus();
  }

  function activateFocused() {
    const focused = document.activeElement;
    if (focused?.shadowRoot) {
      const active = focused.shadowRoot.activeElement;
      if (active) active.click();
    }
  }

  function goBack() {
    // Move focus back to feed list
    const feedList = document.querySelector('feed-list');
    if (feedList) feedList.focus();
  }

  function enable() {
    active = true;
  }

  function disable() {
    active = false;
  }

  function attach() {
    document.addEventListener('keydown', handleKeydown);
  }

  function detach() {
    document.removeEventListener('keydown', handleKeydown);
  }

  return { attach, detach, enable, disable };
}
