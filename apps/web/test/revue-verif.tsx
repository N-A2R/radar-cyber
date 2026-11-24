/**
 * Écran Revue — vérification en DOM (jsdom).
 *
 * On intercepte `fetch` et on monte le composant pour contrôler ce qui part
 * vers /api/quarantine/*. Ce test prouve les faits observables : paramètres de
 * la file, états chargement/erreur/vide, motif saisi (jamais codé en dur),
 * corps des trois décisions et retrait local de la ligne.
 *
 *   pnpm -F @radar/web run test:revue
 */
import { JSDOM } from "jsdom";
import type { Root } from "react-dom/client";
import type { RevueQueue, RevueRow } from "../src/components/ReviewView";
import { parseHash, toHash, type ReviewUrlState } from "../src/url-state";

// jsdom doit exister avant l'évaluation de React : les imports du composant
// sont différés exprès, sinon React fige son environnement hors navigateur.
type ReactModule = typeof import("react");
type DomModule = typeof import("react-dom/client");
type ViewModule = typeof import("../src/components/ReviewView");
type Act = ReactModule["act"];
type CreateRoot = DomModule["createRoot"];
type ReviewViewType = ViewModule["default"];
let act: Act;
let createRoot: CreateRoot;
let ReviewView: ReviewViewType;

const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});
const g = globalThis as unknown as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator, configurable: true, writable: true,
});
g.HTMLElement = dom.window.HTMLElement;
g.HTMLInputElement = dom.window.HTMLInputElement;
g.Node = dom.window.Node;
g.Event = dom.window.Event;
g.KeyboardEvent = dom.window.KeyboardEvent;
g.MouseEvent = dom.window.MouseEvent;
g.getComputedStyle = dom.window.getComputedStyle;
g.requestAnimationFrame = dom.window.requestAnimationFrame;
g.cancelAnimationFrame = dom.window.cancelAnimationFrame;
g.IS_REACT_ACT_ENVIRONMENT = true;

let failures = 0;
let checks = 0;
function check(label: string, ok: boolean, detail?: unknown): void {
  checks++;
  if (ok) console.log(`OK   ${label}`);
  else {
    failures++;
    console.error(`FAIL ${label}`, detail === undefined ? "" : detail);
  }
}

type Call = { url: string; method: string; body: Record<string, unknown> | null };
const calls: Call[] = [];
let queueStatus = 200;
let decisionStatus = 200;
let holdQueue = false;
let releaseQueue: (() => void) | null = null;
let unauthorized = 0;
const opened: number[] = [];

function row(id: number, hint: string, bucket: "chaud" | "tiede" | "froid"): RevueRow {
  return {
    id, source: "jeu-test", sourceUrl: "https://exemple.test/a", groupe: "lockbit3",
    orgHint: hint, claimedAt: "2025-01-05T12:00:00Z", receivedAt: "2026-11-10T12:00:00Z",
    tlp: "RED", status: "pending", promoted: false, promotedBy: null, promotedAt: null,
    hasDescription: false,
    triage: {
      score: id * 3, bucket, suggested: "review", reasons: [{ label: "domaine déclaré", weight: 20 }],
      declaredCountry: "France", domainOnly: false, disagreement: false, referentialGap: bucket !== "froid",
    },
    org: id === 11 ? { id: 7, name: "Mairie de Pessac", kind: "commune", city: "Pessac" } : null,
    orgConfidence: id === 11 ? 0.85 : null,
    review: [],
    candidates: id === 11
      ? [{ id: 7, name: "Mairie de Pessac", score: 0.86, via: "domain" as const, city: "Pessac", dept: "33" }]
      : id === 12
        ? [{ id: 8, name: "ACME SAS", score: 0.42, via: "alias" as const, city: "Bordeaux", dept: "33" }]
        : [],
    rejectRule: null, city: null, dept: null,
  };
}

const initialRows: RevueRow[] = [
  row(11, "Commune de Pessac", "tiede"),
  row(12, "acme.com", "froid"),
  row(13, "autre.fr", "chaud"),
];
function payload(rows: RevueRow[] = initialRows): RevueQueue {
  return {
    rows, total: rows.length, page: 0, limit: 50, window: 500, truncated: false,
    facets: { source: [], groupe: [], bucket: [], status: [] },
    counts: { pending: rows.length, reviewed: 0, rejected: 0, promoted: 0 },
    tookMs: 12,
  };
}
let queueBody: RevueQueue = payload();

function outcome(body: Record<string, unknown> | null): Record<string, unknown> {
  const ids = Array.isArray(body?.ids) ? body!.ids as number[] : [];
  return {
    action: String(body?.action ?? "review"), requested: ids.length, changed: ids.length,
    promoted: 0, alerts: 0, skipped: [],
  };
}

g.fetch = async (input: unknown, init?: { method?: string; body?: string }) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  const body = init?.body ? JSON.parse(init.body) as Record<string, unknown> : null;
  calls.push({ url, method, body });
  if (url.includes("/api/quarantine/queue")) {
    if (holdQueue) {
      holdQueue = false;
      const gate = Promise.withResolvers<void>();
      releaseQueue = () => gate.resolve();
      await gate.promise;
    }
    const ok = queueStatus === 200;
    return { ok, status: queueStatus, json: async () => (ok ? queueBody : { error: "queue unavailable" }) };
  }
  if (url.includes("/api/quarantine/review")) {
    const ok = decisionStatus === 200;
    return {
      ok, status: decisionStatus,
      json: async () => (ok ? outcome(body) : { error: "decision rejected" }),
    };
  }
  if (url.includes("/api/orgs/from-hint")) {
    return { ok: true, status: 201, json: async () => ({ org: { id: 7, name: String(body?.nom ?? "") }, created: true, matchedBy: null }) };
  }
  throw new Error(`appel inattendu : ${url}`);
};

const container = dom.window.document.getElementById("root")!;
let root: Root;

async function flush(): Promise<void> {
  for (let n = 0; n < 4; n++) await act(async () => { await Promise.resolve(); });
}
async function release(): Promise<void> {
  await act(async () => { releaseQueue?.(); releaseQueue = null; });
  await flush();
}
async function mount(options: { canWrite?: boolean; server?: boolean } = {}): Promise<void> {
  await act(async () => {
    root = createRoot(container);
    root.render(
      <ReviewView
        canWrite={options.canWrite ?? true}
        server={options.server ?? true}
        onUnauthorized={() => { unauthorized++; }}
        onOpenOrg={(id) => { opened.push(id); }}
        urlState={parseHash(dom.window.location.hash).review}
        onUrlStateChange={onReviewUrlStateChange}
      />,
    );
  });
  await flush();
}
async function unmount(): Promise<void> {
  await act(async () => { root.unmount(); });
}

function rows(): HTMLElement[] {
  return [...container.querySelectorAll(".revue__row")] as HTMLElement[];
}
function rowByHint(hint: string): HTMLElement {
  const found = rows().find((item) => (item.textContent ?? "").includes(hint));
  if (!found) throw new Error(`ligne introuvable : ${hint}`);
  return found;
}
function buttonIn(scope: ParentNode, label: string): HTMLButtonElement {
  const found = [...scope.querySelectorAll("button")]
    .find((item) => (item.textContent ?? "").includes(label)) as HTMLButtonElement | undefined;
  if (!found) throw new Error(`bouton introuvable : ${label}`);
  return found;
}
function click(element: Element): void {
  act(() => { (element as HTMLElement).click(); });
}
function setField(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = element.tagName === "TEXTAREA"
    ? dom.window.HTMLTextAreaElement.prototype
    : dom.window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  act(() => {
    setter?.call(element, value);
    element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}
function lastCall(urlPart: string): Call | undefined {
  return [...calls].reverse().find((item) => item.url.includes(urlPart));
}
function queueCalls(): number {
  return calls.filter((item) => item.url.includes("/api/quarantine/queue")).length;
}
function decisionCalls(): number {
  return calls.filter((item) => item.url.includes("/api/quarantine/review")).length;
}

// Même câblage que l'App : le composant annonce ses filtres, le hash les porte.
function onReviewUrlStateChange(next: ReviewUrlState): void {
  const hash = toHash({ ...parseHash(dom.window.location.hash), view: "action", actionTab: "review", review: next });
  if (dom.window.location.hash !== hash) dom.window.history.replaceState(null, "", hash);
}
async function wait(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  await act(async () => { await promise; });
}

async function main(): Promise<void> {
  const react = await import("react");
  const reactDom = await import("react-dom/client");
  const view = await import("../src/components/ReviewView");
  act = react.act;
  createRoot = reactDom.createRoot;
  ReviewView = view.default;

  // --- chargement puis file rendue --------------------------------------
  holdQueue = true;
  await mount();
  check("chargement affiché", (container.textContent ?? "").includes("Chargement de la file de revue…"));
  const firstGet = lastCall("/api/quarantine/queue");
  check("GET /api/quarantine/queue en 50 par page", firstGet?.url.includes("limit=50") === true && firstGet?.url.includes("page=0") === true, firstGet?.url);
  await release();
  check("trois lignes rendues", rows().length === 3);
  check("indice, source et date visibles", (container.textContent ?? "").includes("Commune de Pessac")
    && (container.textContent ?? "").includes("jeu-test")
    && (container.textContent ?? "").includes("2025-01-05"), (container.querySelector(".revue__row")?.textContent ?? "").slice(0, 300));
  check("candidats avec score affichés", (container.textContent ?? "").includes("Mairie de Pessac")
    && (container.textContent ?? "").includes("0.86"));
  check("compteur de résultats visible", (container.querySelector(".revue__results")?.textContent ?? "").includes("3 affichées sur 3"),
    container.querySelector(".revue__results")?.textContent);

  // --- filtres, debounce et persistance dans l'URL ---------------------
  click(buttonIn(container.querySelector(".revue__buckets")!, "Tiède"));
  await flush();
  check("filtre bucket envoyé", lastCall("/api/quarantine/queue")?.url.includes("bucket=tiede") === true, lastCall("/api/quarantine/queue")?.url);
  check("bucket persisté dans l'URL", dom.window.location.hash.includes("bucket=tiede"), dom.window.location.hash);

  const beforeDebounce = queueCalls();
  setField(container.querySelector("#revue-q") as HTMLInputElement, "acme");
  await flush();
  check("debounce : aucun appel pendant la frappe", queueCalls() === beforeDebounce, { appels: queueCalls() - beforeDebounce });
  await wait(340);
  await flush();
  check("recherche q envoyée après 300 ms", lastCall("/api/quarantine/queue")?.url.includes("q=acme") === true, lastCall("/api/quarantine/queue")?.url);
  check("q et bucket dans l'URL après interaction",
    dom.window.location.hash.includes("q=acme") && dom.window.location.hash.includes("bucket=tiede"), dom.window.location.hash);

  setField(container.querySelector("#revue-q") as HTMLInputElement, "");
  click(buttonIn(container.querySelector(".revue__search")!, "Rechercher"));
  await flush();
  check("effacement immédiat de la recherche", lastCall("/api/quarantine/queue")?.url.includes("q=") !== true
    && dom.window.location.hash.includes("q=") !== true, dom.window.location.hash);
  click(buttonIn(container.querySelector(".revue__buckets")!, "Toutes"));
  await flush();

  // --- états erreur et vide --------------------------------------------
  queueStatus = 403;
  click(buttonIn(container.querySelector(".revue__buckets")!, "Froid"));
  await flush();
  check("message d'erreur typé affiché", (container.querySelector(".revue__error")?.textContent ?? "").includes("HTTP 403"),
    container.querySelector(".revue__error")?.textContent);
  queueStatus = 200;
  click(buttonIn(container.querySelector(".revue__buckets")!, "Toutes"));
  await flush();

  queueBody = payload([]);
  click(buttonIn(container.querySelector(".revue__buckets")!, "Chaud"));
  await flush();
  check("état vide explicite", (container.textContent ?? "").includes("Aucune revendication restante à examiner."));
  queueBody = payload();
  click(buttonIn(container.querySelector(".revue__buckets")!, "Toutes"));
  await flush();

  // --- accepter : motif libre, action promote ---------------------------
  const beforeDecision = queueCalls();
  click(buttonIn(rowByHint("Commune de Pessac"), "Accepter"));
  await flush();
  let form = container.querySelector(".revue__decision")!;
  let reason = form.querySelector("textarea") as HTMLTextAreaElement;
  check("motif vide à l'ouverture", reason.value === "", reason.value);
  check("confirmation bloquée sans motif", buttonIn(form, "Confirmer").disabled);
  setField(reason, "domaine confirmé au registre");
  await flush();
  check("confirmation activée après motif", !buttonIn(form, "Confirmer").disabled);
  click(buttonIn(form, "Confirmer"));
  await flush();
  const accepted = lastCall("/api/quarantine/review");
  check("POST promote avec le motif saisi",
    accepted?.url === "/api/quarantine/review"
      && JSON.stringify(accepted?.body) === JSON.stringify({ ids: [11], action: "promote", reason: "domaine confirmé au registre" }),
    accepted);
  check("la ligne décidée disparaît sans recharger la file",
    rows().length === 2 && queueCalls() === beforeDecision, { lignes: rows().length, gets: queueCalls() - beforeDecision });

  // --- refuser : aucune organisation -----------------------------------
  click(buttonIn(rowByHint("acme.com"), "Rejeter"));
  await flush();
  form = container.querySelector(".revue__decision")!;
  reason = form.querySelector("textarea") as HTMLTextAreaElement;
  check("motif revolé vide pour une nouvelle décision", reason.value === "");
  setField(reason, "hors périmètre régional");
  await flush();
  click(buttonIn(form, "Confirmer"));
  await flush();
  const refused = lastCall("/api/quarantine/review");
  check("POST reject", JSON.stringify(refused?.body) === JSON.stringify({ ids: [12], action: "reject", reason: "hors périmètre régional" }), refused?.body);
  check("deuxième ligne retirée", rows().length === 1);

  // --- créer : organisation réelle depuis l'indice, puis promote --------
  click(buttonIn(rowByHint("autre.fr"), "Créer l'organisation"));
  await flush();
  form = container.querySelector(".revue__decision")!;
  reason = form.querySelector("textarea") as HTMLTextAreaElement;
  setField(reason, "organisation absente du référentiel");
  await flush();
  click(buttonIn(form, "Confirmer"));
  await flush();
  const created = lastCall("/api/quarantine/review");
  check("POST promote après création depuis l'indice",
    JSON.stringify(created?.body) === JSON.stringify({ ids: [13], action: "promote", reason: "organisation absente du référentiel" }), created?.body);
  check("création passée par la route réelle /orgs/from-hint",
    lastCall("/api/orgs/from-hint")?.body?.nom === "autre.fr", lastCall("/api/orgs/from-hint")?.body);
  check("toutes les décisions ont un motif saisi",
    [accepted, refused, created].every((call) => typeof call?.body?.reason === "string" && String(call.body.reason).length > 0)
      && new Set([accepted?.body?.reason, refused?.body?.reason, created?.body?.reason]).size === 3);
  check("dernière ligne retirée, état vide visible",
    rows().length === 0 && (container.textContent ?? "").includes("Aucune revendication restante à examiner."));
  check("trois décisions envoyées, aucune relecture de la file", decisionCalls() === 3 && queueCalls() === beforeDecision);

  // --- erreur de décision : la ligne reste -----------------------------
  click(buttonIn(container.querySelector(".revue__buckets")!, "Chaud"));
  await flush();
  const beforeFailed = rows().length;
  decisionStatus = 400;
  click(buttonIn(rowByHint("autre.fr"), "Rejeter"));
  await flush();
  form = container.querySelector(".revue__decision")!;
  setField(form.querySelector("textarea") as HTMLTextAreaElement, "motif valide");
  await flush();
  click(buttonIn(form, "Confirmer"));
  await flush();
  check("erreur de décision affichée", (container.querySelector(".revue__error")?.textContent ?? "").includes("HTTP 400"));
  check("ligne conservée après échec", rows().length === beforeFailed);
  decisionStatus = 200;

  // --- 401 -------------------------------------------------------------
  queueStatus = 401;
  click(buttonIn(container.querySelector(".revue__buckets")!, "Toutes"));
  await flush();
  check("401 signalée à l'application", unauthorized > 0);
  check("401 : message d'erreur rendu", (container.querySelector(".revue__error")?.textContent ?? "").includes("HTTP 401"));
  queueStatus = 200;

  // --- lecture seule et mode sans API ---------------------------------
  await unmount();
  calls.length = 0;
  await mount({ canWrite: false });
  check("lecture seule : toutes les actions désactivées",
    rows().every((item) => [...item.querySelectorAll(".revue__actions button")].every((button) => (button as HTMLButtonElement).disabled)));
  check("lecture seule : message explicite", (container.textContent ?? "").includes("Lecture seule"));

  await unmount();
  calls.length = 0;
  await mount({ server: false });
  check("sans API : aucun appel réseau", calls.length === 0);
  check("sans API : état explicite", (container.textContent ?? "").includes("nécessite l'API"));
  await unmount();

  // --- lien profond : l'URL initiale pilote les filtres -----------------
  calls.length = 0;
  dom.window.history.replaceState(null, "", "#/review?bucket=froid&q=depuislien");
  await mount();
  check("lien profond : bucket coché", buttonIn(container.querySelector(".revue__buckets")!, "Froid").getAttribute("aria-pressed") === "true");
  check("lien profond : q dans le champ", (container.querySelector("#revue-q") as HTMLInputElement).value === "depuislien");
  check("lien profond : API filtrée",
    lastCall("/api/quarantine/queue")?.url.includes("q=depuislien") === true
      && lastCall("/api/quarantine/queue")?.url.includes("bucket=froid") === true, lastCall("/api/quarantine/queue")?.url);
  await unmount();
  dom.window.history.replaceState(null, "", "#/");

  console.log(`\n${checks - failures}/${checks} contrôles de revue.`);
  if (failures > 0) {
    console.error(`${failures} contrôle(s) en échec.`);
    process.exitCode = 1;
  } else {
    console.log("Tous les contrôles passent.");
  }
  dom.window.close();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
  dom.window.close();
});
