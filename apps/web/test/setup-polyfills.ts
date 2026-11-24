// jsdom n'implémente pas CSS.escape, utilisé par les Dialog/Drawer Astryx.
// Le navigateur, lui, fournit cette API ; le test doit voir le même contrat.
if (typeof globalThis.CSS === "undefined") {
  Object.defineProperty(globalThis, "CSS", { value: {}, configurable: true });
}
if (typeof globalThis.CSS.escape !== "function") {
  globalThis.CSS.escape = (value: string) => String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

// jsdom ne rend pas les boîtes de dialogue natives : Astryx attend showModal/close.
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

// axe-core mesure la largeur du texte avec un canvas 2D, absent de jsdom.
HTMLCanvasElement.prototype.getContext = function (type: string) {
  if (type !== "2d") return null;
  return {
    canvas: this,
    font: "",
    fillStyle: "",
    strokeStyle: "",
    measureText: (text: string) => ({ width: String(text).length * 8 }),
  } as unknown as CanvasRenderingContext2D;
};
