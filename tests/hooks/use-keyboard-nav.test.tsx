import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useKeyboardNav } from "@/hooks/use-keyboard-nav.ts";

function createListbox(itemCount: number, selectedIndex = -1): HTMLElement {
  const listbox = document.createElement("ul");
  listbox.setAttribute("role", "listbox");

  for (let i = 0; i < itemCount; i++) {
    const item = document.createElement("li");
    item.setAttribute("role", "option");
    item.setAttribute("tabindex", "0");
    item.textContent = `Item ${i}`;
    if (i === selectedIndex) {
      item.setAttribute("aria-selected", "true");
    }
    listbox.appendChild(item);
  }

  document.body.appendChild(listbox);
  return listbox;
}

function pressKey(key: string, target: EventTarget = document) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

describe("useKeyboardNav", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("j moves focus to the first item when nothing is focused", () => {
    const listbox = createListbox(3);
    renderHook(() => useKeyboardNav());

    pressKey("j");

    expect(document.activeElement).toBe(listbox.children[0]);
  });

  it("j moves focus down by one item", () => {
    const listbox = createListbox(3);
    renderHook(() => useKeyboardNav());

    (listbox.children[0] as HTMLElement).focus();
    pressKey("j");

    expect(document.activeElement).toBe(listbox.children[1]);
  });

  it("k moves focus up by one item", () => {
    const listbox = createListbox(3);
    renderHook(() => useKeyboardNav());

    (listbox.children[2] as HTMLElement).focus();
    pressKey("k");

    expect(document.activeElement).toBe(listbox.children[1]);
  });

  it("j does not go past the last item", () => {
    const listbox = createListbox(3);
    renderHook(() => useKeyboardNav());

    (listbox.children[2] as HTMLElement).focus();
    pressKey("j");

    expect(document.activeElement).toBe(listbox.children[2]);
  });

  it("k does not go before the first item", () => {
    const listbox = createListbox(3);
    renderHook(() => useKeyboardNav());

    (listbox.children[0] as HTMLElement).focus();
    pressKey("k");

    expect(document.activeElement).toBe(listbox.children[0]);
  });

  it("k focuses the last item when nothing is focused", () => {
    const listbox = createListbox(3);
    renderHook(() => useKeyboardNav());

    pressKey("k");

    expect(document.activeElement).toBe(listbox.children[2]);
  });

  it("Enter clicks the focused option element", () => {
    const listbox = createListbox(3);
    renderHook(() => useKeyboardNav());

    let clicked = false;
    (listbox.children[1] as HTMLElement).addEventListener("click", () => {
      clicked = true;
    });
    (listbox.children[1] as HTMLElement).focus();

    pressKey("Enter");

    expect(clicked).toBe(true);
  });

  it("Enter does nothing when focused element is not an option", () => {
    createListbox(3);
    renderHook(() => useKeyboardNav());

    const div = document.createElement("div");
    div.setAttribute("tabindex", "0");
    document.body.appendChild(div);
    div.focus();

    let clicked = false;
    div.addEventListener("click", () => {
      clicked = true;
    });

    pressKey("Enter");

    expect(clicked).toBe(false);
  });

  it("Escape moves focus to the selected item in the first listbox", () => {
    const listbox = createListbox(3, 1);
    renderHook(() => useKeyboardNav());

    // Focus somewhere else
    const div = document.createElement("div");
    div.setAttribute("tabindex", "0");
    div.setAttribute("role", "option");
    document.body.appendChild(div);
    div.focus();

    pressKey("Escape");

    expect(document.activeElement).toBe(listbox.children[1]);
  });

  it("Escape moves focus to the first item when none is selected", () => {
    const listbox = createListbox(3);
    renderHook(() => useKeyboardNav());

    pressKey("Escape");

    expect(document.activeElement).toBe(listbox.children[0]);
  });

  it("ignores keys when an input element is focused", () => {
    const listbox = createListbox(3);
    renderHook(() => useKeyboardNav());

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    pressKey("j", input);

    expect(document.activeElement).toBe(input);
    expect(document.activeElement).not.toBe(listbox.children[0]);
  });

  it("ignores keys when a textarea is focused", () => {
    createListbox(3);
    renderHook(() => useKeyboardNav());

    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    textarea.focus();

    pressKey("j", textarea);

    expect(document.activeElement).toBe(textarea);
  });

  it("ignores keys when a contenteditable element is focused", () => {
    createListbox(3);
    renderHook(() => useKeyboardNav());

    const editable = document.createElement("div");
    editable.contentEditable = "true";
    editable.setAttribute("tabindex", "0");
    document.body.appendChild(editable);
    editable.focus();

    pressKey("j", editable);

    expect(document.activeElement).toBe(editable);
  });

  it("does nothing when no listbox exists", () => {
    renderHook(() => useKeyboardNav());

    // Should not throw
    pressKey("j");
    pressKey("k");
    pressKey("Enter");
    pressKey("Escape");
  });

  it("does nothing for unhandled keys", () => {
    createListbox(3);
    renderHook(() => useKeyboardNav());

    const event = pressKey("a");

    // Unhandled keys should not be preventDefault'd
    // (In happy-dom this isn't fully testable but we ensure no error)
    expect(event.defaultPrevented).toBe(false);
  });

  it("uses the listbox containing the focused element", () => {
    // Create two listboxes
    const listbox1 = createListbox(2);
    const listbox2 = createListbox(3);

    renderHook(() => useKeyboardNav());

    // Focus an item in the second listbox
    (listbox2.children[0] as HTMLElement).focus();
    pressKey("j");

    // Should move within the second listbox, not the first
    expect(document.activeElement).toBe(listbox2.children[1]);
    expect(document.activeElement).not.toBe(listbox1.children[0]);
  });

  it("removes the event listener on unmount", () => {
    createListbox(3);
    const { unmount } = renderHook(() => useKeyboardNav());

    unmount();
    pressKey("j");

    // Focus should not have moved since the listener was removed
    expect(document.activeElement).toBe(document.body);
  });
});
