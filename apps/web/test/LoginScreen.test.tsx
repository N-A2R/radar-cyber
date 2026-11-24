// @vitest-environment jsdom
/**
 * Écran de connexion — hiérarchie, états explicites et accessibilité.
 * On observe ce que l'utilisateur voit et ce qui part réellement vers l'API :
 * champs vides, adresse incomplète, identifiants refusés, envoi en cours,
 * succès. Aucun réseau réel.
 */
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import LoginScreen from "../src/components/LoginScreen";

const testGlobals = globalThis as unknown as Record<string, unknown>;
testGlobals.IS_REACT_ACT_ENVIRONMENT = true;

type Call = { url: string; method: string; body: { email?: string; password?: string } | null };

function response(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

function setInput(element: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(element, value);
    element.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => { await Promise.resolve(); });
  }
}

function submit(form: HTMLFormElement): void {
  act(() => {
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  });
}

describe("LoginScreen — connexion soignée", () => {
  let calls: Call[];
  let host: HTMLDivElement;
  let root: Root | undefined;
  let onAuthenticated: Mock;

  beforeEach(() => {
    calls = [];
    onAuthenticated = vi.fn();
    host = document.createElement("div");
    document.body.appendChild(host);
    // Par défaut, les chiffres publics sont hors ligne : les tests qui ne
    // portent pas sur la bande de faits n'ont ainsi aucun réseau réel.
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("hors ligne"))));
  });

  afterEach(async () => {
    await act(async () => { root?.unmount(); });
    root = undefined;
    host.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function mount(): Promise<HTMLFormElement> {
    await act(async () => {
      root = createRoot(host);
      root.render(<LoginScreen onAuthenticated={onAuthenticated} />);
    });
    const form = host.querySelector("form");
    if (!form) throw new Error("formulaire absent");
    return form;
  }

  it("se rend aussi côté serveur, sans effet ni état préalable", () => {
    const html = renderToStaticMarkup(<LoginScreen onAuthenticated={() => {}} />);

    expect(html).toContain('id="login-title"');
    expect(html).toContain("Radar Cyber");
    expect(html).toContain('for="login-email"');
    expect(html.toLowerCase()).toContain('autocomplete="username"');
    expect(html.toLowerCase()).toContain('autocomplete="current-password"');
    expect(html).toContain('type="submit"');
    expect(html).toContain("Accès réservé aux agents habilités");
    // Les faits viennent du client : rien d'inventé au rendu serveur.
    expect(html).not.toContain("login__facts");
  });

  it("présente la marque, une phrase de contexte et des champs étiquetés", async () => {
    await mount();

    expect(host.querySelector("h1")?.textContent).toBe("Radar Cyber");
    expect(host.querySelector(".login__subtitle")?.textContent).toContain("observatoire");
    expect(host.querySelector(".login__note")?.textContent).toContain("agents habilités");
    expect(host.querySelector(".login__submit")?.textContent).toBe("Se connecter");

    const email = host.querySelector<HTMLInputElement>("#login-email");
    const password = host.querySelector<HTMLInputElement>("#login-password");
    expect(email).not.toBeNull();
    expect(password).not.toBeNull();
    expect(host.querySelector('label[for="login-email"]')?.textContent).toContain("adresse e-mail");
    expect(host.querySelector('label[for="login-password"]')?.textContent).toContain("mot de passe");
    expect(email?.getAttribute("autocomplete")).toBe("username");
    expect(password?.getAttribute("autocomplete")).toBe("current-password");
    expect(document.activeElement).toBe(email);
  });

  it("affiche les chiffres publics exacts, limités aux douze départements de la région", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url === "/api/stats") {
        return response({ sources: { total: 2506, active: 2405 } });
      }
      if (url === "/api/stats/departements") {
        return response({
          windowDays: 7,
          departements: [
            { departement: "33", evenements7j: 5, organisations: 10, sourcesActives: 2 },
            { departement: "17", evenements7j: 3, organisations: 4, sourcesActives: 1 },
            { departement: "75", evenements7j: 999, organisations: 1, sourcesActives: 0 },
            { departement: "16", evenements7j: 0, organisations: 2, sourcesActives: 0 },
          ],
        });
      }
      return response({}, 404);
    }));

    await mount();
    await flush();

    const band = host.querySelector(".login__facts");
    expect(band).not.toBeNull();
    expect(band?.getAttribute("aria-label")).toBe("Le radar en chiffres");
    const values = [...host.querySelectorAll(".login__fact dd")].map((dd) =>
      (dd.textContent ?? "").replace(/\s/g, " ").trim(),
    );
    expect(values).toEqual(["2 506", "8", "2/12"]);
    const labels = [...host.querySelectorAll(".login__fact dt")].map((dt) => dt.textContent);
    expect(labels).toEqual(["sources suivies", "incidents sur 7 jours", "départements couverts"]);
  });

  it("disparaît sans trou ni message quand les statistiques sont indisponibles", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: unknown) =>
      String(input) === "/api/stats"
        ? response({ error: "boom" }, 500)
        : response({ departements: [] }),
    ));

    await mount();
    await flush();

    expect(host.querySelector(".login__facts")).toBeNull();
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.querySelector(".login__error")).toBeNull();
    expect(host.textContent).not.toContain("erreur");
    expect(host.querySelector("form")).not.toBeNull();
    expect(host.querySelector<HTMLInputElement>("#login-email")).not.toBeNull();
  });

  it("disparaît aussi si la réponse ne respecte pas le contrat attendu", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: unknown) =>
      String(input) === "/api/stats"
        ? response({ sources: "beaucoup" })
        : response({ departements: "aucun" }),
    ));

    await mount();
    await flush();

    expect(host.querySelector(".login__facts")).toBeNull();
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it("refuse un formulaire vide sans appeler l'API, et relie chaque message au champ", async () => {
    const form = await mount();
    submit(form);

    expect(calls).toHaveLength(0);
    const email = host.querySelector<HTMLInputElement>("#login-email")!;
    const password = host.querySelector<HTMLInputElement>("#login-password")!;

    expect(email.getAttribute("aria-invalid")).toBe("true");
    expect(password.getAttribute("aria-invalid")).toBe("true");
    const emailError = document.getElementById(email.getAttribute("aria-describedby")!);
    const passwordError = document.getElementById(password.getAttribute("aria-describedby")!);
    expect(emailError?.textContent).toBe("indiquez votre adresse e-mail");
    expect(passwordError?.textContent).toBe("indiquez votre mot de passe");
    expect(document.activeElement).toBe(email);
  });

  it("signale une adresse incomplète, puis efface le message à la saisie", async () => {
    const form = await mount();
    const email = host.querySelector<HTMLInputElement>("#login-email")!;
    setInput(email, "agent");
    submit(form);

    const errorId = email.getAttribute("aria-describedby");
    expect(document.getElementById(errorId ?? "")?.textContent).toBe("cette adresse e-mail semble incomplète");
    expect(calls).toHaveLength(0);

    setInput(email, "agent@exemple.fr");
    expect(document.getElementById(errorId ?? "")).toBeNull();
    expect(email.getAttribute("aria-invalid")).toBeNull();
  });

  it("pendant l'envoi : bouton et champs désactivés, état annoncé", async () => {
    const pending = Promise.withResolvers<Response>();
    vi.stubGlobal("fetch", vi.fn(() => pending.promise));

    const form = await mount();
    setInput(host.querySelector<HTMLInputElement>("#login-email")!, "agent@exemple.fr");
    setInput(host.querySelector<HTMLInputElement>("#login-password")!, "secret");
    submit(form);
    await flush();

    const button = host.querySelector<HTMLButtonElement>(".login__submit")!;
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.textContent).toContain("Connexion…");
    expect(host.querySelector(".login__status")?.textContent).toBe("Vérification des identifiants…");
    expect(host.querySelector<HTMLInputElement>("#login-email")?.getAttribute("aria-disabled")).toBe("true");

    await act(async () => { pending.resolve(response({ token: "jeton-1" })); });
    await flush();
  });

  it("identifiants refusés : message utile et alerte annoncée", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (!url.endsWith("/auth/login")) return response({}, 404);
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as Call["body"] : null;
      calls.push({ url, method: init?.method ?? "GET", body });
      return response({ error: "invalid" }, 401);
    }));

    const form = await mount();
    setInput(host.querySelector<HTMLInputElement>("#login-email")!, "Agent@Exemple.FR ");
    setInput(host.querySelector<HTMLInputElement>("#login-password")!, "mauvais");
    submit(form);
    await flush();

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/auth/login");
    expect(calls[0].body).toEqual({ email: "agent@exemple.fr", password: "mauvais" });
    expect(onAuthenticated).not.toHaveBeenCalled();

    const alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("mot de passe incorrect");
    expect(alert?.textContent).toContain("réessayez");
    expect(host.querySelector<HTMLButtonElement>(".login__submit")?.getAttribute("aria-disabled")).not.toBe("true");
  });

  it("identifiants acceptés : le jeton remonte au shell", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ token: "jeton-42", user: { id: 1 } })));

    const form = await mount();
    setInput(host.querySelector<HTMLInputElement>("#login-email")!, "agent@exemple.fr");
    setInput(host.querySelector<HTMLInputElement>("#login-password")!, "secret");
    submit(form);
    await flush();

    expect(onAuthenticated).toHaveBeenCalledWith("jeton-42");
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it("serveur injoignable : message distinct du refus d'identifiants", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => response({ error: "boom" }, 500)));

    const form = await mount();
    setInput(host.querySelector<HTMLInputElement>("#login-email")!, "agent@exemple.fr");
    setInput(host.querySelector<HTMLInputElement>("#login-password")!, "secret");
    submit(form);
    await flush();
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    await flush();

    const alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("Impossible de joindre le serveur");
    expect(alert?.textContent).not.toContain("incorrect");
    vi.useRealTimers();
  });
});
