// jsdom n'implémente pas CSS.escape, utilisé par les Dialog/Drawer Astryx.
// Le navigateur, lui, fournit cette API ; le test doit voir le même contrat.
if (typeof globalThis.CSS === "undefined") {
  Object.defineProperty(globalThis, "CSS", { value: {}, configurable: true });
}
if (typeof globalThis.CSS.escape !== "function") {
  globalThis.CSS.escape = (value: string) => String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

if (typeof HTMLDialogElement !== "undefined") {
  const dialogPrototype = HTMLDialogElement.prototype;
  if (typeof dialogPrototype.showModal !== "function") {
    Object.defineProperty(dialogPrototype, "showModal", {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.setAttribute("open", "");
        const focusable = this.querySelector<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
        (focusable ?? this).focus();
      },
    });
  }
  if (typeof dialogPrototype.close !== "function") {
    Object.defineProperty(dialogPrototype, "close", {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.removeAttribute("open");
        this.dispatchEvent(new Event("close"));
      },
    });
  }
}
if (typeof HTMLCanvasElement !== "undefined") {
  // axe-core mesure la largeur du texte avec un canvas 2D, absent de jsdom.
  // Cast nommé : le stub ne couvre que le contexte 2d utilisé par axe.
  const contexte2d = function (this: HTMLCanvasElement, type: string) {
    if (type !== "2d") return null;
    return {
      canvas: this,
      font: "",
      fillStyle: "",
      strokeStyle: "",
      measureText: (text: string) => ({ width: String(text).length * 8 }),
    } as unknown as CanvasRenderingContext2D;
  } as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = contexte2d;
}
// jsdom n'a pas ResizeObserver ; sharedResizeObserver d'Astryx appelle aussi
// unobserve() au démontage. Le stub couvre donc les trois opérations du
// contrat navigateur, sans mesurer la mise en page réelle.
if (typeof globalThis.ResizeObserver === "undefined") {
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    writable: true,
    value: class ResizeObserverStub {
      constructor(private readonly callback: (entries: unknown[]) => void) {}
      observe(target: Element) {
        this.callback([{ target, contentRect: { width: 800, height: 600 } }]);
      }
      unobserve() {}
      disconnect() {}
    },
  });
}
