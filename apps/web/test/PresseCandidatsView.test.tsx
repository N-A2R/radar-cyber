// @vitest-environment jsdom
/**
 * Écran de revue presse : la preuve observable est la file qui se vide.
 * Le composant reçoit un `fetch` de test : aucun appel réseau.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PresseCandidatsView, { type CandidatPresse, type StatsPresse } from "../src/components/PresseCandidatsView";

const testGlobals = globalThis as unknown as Record<string, unknown>;
testGlobals.IS_REACT_ACT_ENVIRONMENT = true;

type Call = { url: string; method: string; body: Record<string, string> | null };

function candidat(n: number): CandidatPresse {
  return {
    cle: `cle-${n}`,
    titre: `Cyberattaque chez Org ${n}`,
    extrait: `L'organisation ${n} a été victime d'une fuite de données.`,
    url: `https://exemple.test/article-${n}`,
    date: `2026-11-2${n}`,
    source: "Presse test",
    orgProposee: n === 1 ? "Org 1" : null,
    scoreConfiance: n === 1 ? 0.82 : 0.34,
  };
}

function stats(enAttente: number, traites: number): StatsPresse {
  return {
    enAttente, traites, traitesDansPasse: traites,
    tauxConfirmation: traites === 0 ? null : 50,
    confirme: Math.round(traites / 2), refuse: traites - Math.round(traites / 2), reclasse: 0,
  };
}

function reponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => { await Promise.resolve(); });
  }
}

function setValeur(element: HTMLTextAreaElement | HTMLInputElement, value: string): void {
  const prototype = element instanceof window.HTMLTextAreaElement
    ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  act(() => {
    setter?.call(element, value);
    element.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

describe("PresseCandidatsView — vider la file", () => {
  let calls: Call[];
  let restants: CandidatPresse[];
  let decisions: Array<Record<string, unknown>>;
  let root: Root | undefined;
  let host: HTMLDivElement;

  beforeEach(() => {
    calls = [];
    restants = [candidat(1), candidat(2)];
    decisions = [];
    const fetchImpl = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, string> : null;
      calls.push({ url, method: init?.method ?? "GET", body });
      if (url.startsWith("/api/presse/candidats/decisions")) return reponse({ rows: decisions });
      if (url.startsWith("/api/presse/candidats/stats")) return reponse(stats(restants.length, 2 - restants.length));
      if (url.startsWith("/api/presse/candidats?")) {
        return reponse({ rows: restants, total: restants.length, statistiques: stats(restants.length, 0) });
      }
      const match = url.match(/\/api\/presse\/candidats\/(.+)\/decision$/);
      if (match) {
        const cle = decodeURIComponent(match[1]);
        restants = restants.filter((row) => row.cle !== cle);
        decisions.push({
          id: decisions.length + 1, decision: body?.decision, auteur: "humain:analyste@radar.local",
          horodatage: "2026-11-21T10:00:00Z", raison: body?.raison, org_retenue: body?.orgRetenue ?? null,
        });
        return reponse({ ok: true });
      }
      throw new Error(`appel inattendu : ${url}`);
    }) as unknown as typeof fetch;

    host = document.createElement("div");
    document.body.appendChild(host);
    root = undefined;
    // La fonction de test est attachée au described component via une closure
    // de module : on la réinitialise avant chaque montage.
    fetchStub = fetchImpl;
  });

  afterEach(() => {
    act(() => { root?.unmount(); });
    host.remove();
  });

  let fetchStub: typeof fetch;

  it("affiche extrait, URL, date, organisation proposée et score", async () => {
    await act(async () => {
      root = createRoot(host);
      root.render(<PresseCandidatsView canWrite fetchImpl={fetchStub} />);
    });
    await flush();
    expect(host.textContent).toContain("Cyberattaque chez Org 1");
    expect(host.textContent).toContain("victime d'une fuite de données");
    expect(host.textContent).toContain("2026-11-21");
    expect(host.textContent).toContain("Org 1");
    expect(host.textContent).toContain("82 % — élevé");
    expect(host.querySelector('a[href="https://exemple.test/article-1"]')).not.toBeNull();
  });

  it("une décision retire la ligne, journalise motif et passe, puis affiche la mesure", async () => {
    await act(async () => {
      root = createRoot(host);
      root.render(<PresseCandidatsView canWrite fetchImpl={fetchStub} />);
    });
    await flush();

    for (const titre of ["Cyberattaque chez Org 1", "Cyberattaque chez Org 2"]) {
      const ligne = [...host.querySelectorAll("tr")].find((tr) => tr.textContent?.includes(titre));
      expect(ligne, `ligne ${titre}`).toBeDefined();
      const radio = ligne!.querySelector<HTMLInputElement>('input[type="radio"][value="refuser"]')!;
      act(() => { radio.click(); });
      const motif = ligne!.querySelector<HTMLTextAreaElement>("textarea")!;
      setValeur(motif, "article de prévention");
      await act(async () => {
        ligne!.querySelector<HTMLButtonElement>("button")!.click();
      });
      await flush();
    }

    const posts = calls.filter((call) => call.method === "POST");
    expect(posts).toHaveLength(2);
    expect(posts[0].body?.decision).toBe("refuser");
    expect(posts[0].body?.raison).toBe("article de prévention");
    expect(posts[0].body?.passe).toMatch(/^passe-/);
    expect(host.textContent).toContain("File vidée");
    expect(host.textContent).toContain("2 candidats traités en une passe");
    expect(host.textContent).toContain("taux de confirmation observé");
  });

  it("reclasser exige une organisation avant l'envoi", async () => {
    await act(async () => {
      root = createRoot(host);
      root.render(<PresseCandidatsView canWrite fetchImpl={fetchStub} />);
    });
    await flush();

    const ligne = host.querySelector("tbody tr")!;
    act(() => { ligne.querySelector<HTMLInputElement>('input[value="reclasser"]')!.click(); });
    setValeur(ligne.querySelector<HTMLTextAreaElement>("textarea")!, "organisation erronée");
    const bouton = () => ligne.querySelector<HTMLButtonElement>("button")!;
    expect(bouton().disabled).toBe(true);
    const org = ligne.querySelector<HTMLInputElement>('input:not([type="radio"])')!;
    setValeur(org, "Organisation corrigée");
    expect(bouton().disabled).toBe(false);
    await act(async () => { bouton().click(); });
    await flush();
    const posts = calls.filter((call) => call.method === "POST");
    expect(posts[0].body?.orgRetenue).toBe("Organisation corrigée");
  });

  it("le journal de passe affiche l'auteur et l'horodatage des décisions", async () => {
    decisions.push({
      id: 1, decision: "confirmer", auteur: "humain:analyste@radar.local",
      horodatage: "2026-11-21T10:00:00Z", raison: "incident caractérisé", org_retenue: null,
    });
    await act(async () => {
      root = createRoot(host);
      root.render(<PresseCandidatsView canWrite fetchImpl={fetchStub} />);
    });
    await flush();
    await act(async () => {
      host.querySelector<HTMLButtonElement>(".presse-revue__audit button")!.click();
    });
    await flush();
    expect(host.textContent).toContain("humain:analyste@radar.local");
    expect(host.textContent).toContain("incident caractérisé");
    expect(calls.some((call) => call.url.includes("/decisions?passe="))).toBe(true);
  });
});
