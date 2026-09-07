export type DemoKeyboardMode = "device" | "lab" | "preview" | "xr";

const editingControls = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="slider"]';
const nativeActivationControls = 'button, a[href], summary, [role="button"], [role="link"]';

function pathMatches(event: KeyboardEvent, selector: string): boolean {
  return event.composedPath().some(target => {
    const element = target as Element;
    return typeof element.matches === "function" && element.matches(selector);
  });
}

/** Exhibition shortcuts reuse the controls that own each mode's availability. */
export class DemoKeyboard {
  constructor(private readonly document: Document, private readonly mode: () => DemoKeyboardMode) {
    document.addEventListener("keydown", this.onKeyDown, true);
  }

  dispose() {
    this.document.removeEventListener("keydown", this.onKeyDown, true);
  }

  private available(control: HTMLElement | null): boolean {
    return !!control && !control.matches(':disabled, [aria-disabled="true"]') &&
      !control.closest('[hidden], [inert], [aria-disabled="true"]');
  }

  private click(id: string): boolean {
    const button = this.document.getElementById(id);
    if (!this.available(button)) return false;
    button!.click();
    return true;
  }

  private changeSelection(select: HTMLSelectElement, index: number): boolean {
    const option = select.options[index];
    if (!this.available(select) || !option || option.matches(":disabled") || option.hidden) return false;
    if (select.value !== option.value) {
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return true;
  }

  private material(mode: DemoKeyboardMode, key: string): boolean {
    if (mode === "xr") return false;
    const numericIndex = key === "0" ? 9 : /^[1-9]$/.test(key) ? Number(key) - 1 : null;
    const direction = key === "[" ? -1 : key === "]" ? 1 : 0;
    if (numericIndex === null && !direction) return false;

    if (mode === "lab") {
      const buttons = [...this.document.querySelectorAll<HTMLButtonElement>("[data-lab-preset]")];
      let index = numericIndex;
      if (index === null) {
        const current = buttons.findIndex(button => button.getAttribute("aria-pressed") === "true");
        index = this.adjacent(current, direction, buttons.map(button => this.available(button)));
      }
      const button = buttons[index];
      if (!this.available(button)) return false;
      button.click();
      return true;
    }

    const select = this.document.getElementById(mode === "device" ? "device-preset" : "preset-select") as HTMLSelectElement;
    if (!this.available(select)) return false;
    const index = numericIndex ?? this.adjacent(select.selectedIndex, direction,
      [...select.options].map(option => !option.matches(":disabled") && !option.hidden));
    return this.changeSelection(select, index);
  }

  private adjacent(current: number, direction: number, available: boolean[]): number {
    const count = available.length;
    // An unknown reported preset starts at the appropriate end of the visible list.
    const start = current < 0 ? (direction > 0 ? -1 : 0) : current;
    for (let step = 1; step <= count; step++) {
      const next = (start + direction * step + count) % count;
      if (available[next]) return next;
    }
    return -1;
  }

  private labTilt(key: string): boolean {
    const axis = key === "ArrowLeft" || key === "ArrowRight" ? "lab-roll" :
      key === "ArrowUp" || key === "ArrowDown" ? "lab-pitch" : null;
    if (!axis) return false;
    const control = this.document.getElementById(axis) as HTMLInputElement;
    if (!this.available(control)) return false;
    const direction = key === "ArrowLeft" || key === "ArrowUp" ? -1 : 1;
    const value = Math.max(Number(control.min), Math.min(Number(control.max), Number(control.value) + direction * 5));
    if (!Number.isFinite(value)) return false;
    control.value = String(value);
    control.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    const key = event.key;
    const onStart = pathMatches(event, "#device-start");
    // Space never starts physical output, including the browser's button default.
    // A held Enter on that button must not generate repeated Start requests either.
    if ((key === " " && onStart) || (event.repeat && key === "Enter" && onStart)) {
      event.preventDefault();
      return;
    }
    if (event.repeat) return;
    const mode = this.mode();
    if (key === "Escape") {
      // Stop remains usable during a pending operation and while an input has focus.
      let handled = this.click("device-stop");
      if (!handled && mode === "lab") {
        const pause = this.document.getElementById("lab-pause");
        if (this.available(pause)) {
          handled = pause!.getAttribute("aria-pressed") === "true" || this.click("lab-pause");
        }
      }
      if (handled) event.preventDefault();
      return;
    }
    if (event.defaultPrevented || pathMatches(event, editingControls)) return;
    // Focused buttons/links retain their native Enter/Space action, without also
    // running a global shortcut. The physical Start Space exception is above.
    if ((key === "Enter" || key === " ") && pathMatches(event, nativeActivationControls)) return;

    let handled = this.material(mode, key);
    if (key === "Enter" && mode === "device") handled = this.click("device-start");
    if (key === " ") {
      if (mode === "lab") handled = this.click("lab-pause");
      else if (mode === "preview") {
        const select = this.document.getElementById("stimulus-select") as HTMLSelectElement;
        const next = select.value === "wall_tap" ? "manual" : "wall_tap";
        handled = this.changeSelection(select, [...select.options].findIndex(option => option.value === next));
      }
    }
    if (mode === "lab") {
      if (key.toLowerCase() === "r") handled = this.click("lab-reset");
      if (key.toLowerCase() === "s") handled = this.click("lab-shake");
      if (key.startsWith("Arrow")) handled = this.labTilt(key);
    }
    if (handled) event.preventDefault();
  };
}
