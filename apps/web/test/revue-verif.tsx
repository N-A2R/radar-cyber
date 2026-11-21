/**
 * Écran Revue — vérification en DOM (jsdom).
 *
 * On intercepte `fetch` et on monte le composant pour contrôler ce qui part
 * vers /api/review/*. Ce test prouve les faits observables : paramètres de
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
let queueErrorBody: Record<string, unknown> = { error: "file indisponible" };
let decisionStatus = 200;
let decisionErrorBody: Record<string, unknown> = { error: "décision refusée" };
let holdQueue = false;
let releaseQueue: (() => void) | null = null;
let unauthorized = 0;
const opened: number[] = [];
let urlState: ReviewUrlState = { q: "", bucket: "" };
function persistUrl(next: ReviewUrlState): void {
  urlState = next;
  dom.window.history.replaceState(null, "", toHash({
    ...parseHash("#/review"), view: "review", review: next,
  }));
}

function row(id: number, hint: string, bucket: "chaud" | "tiede" | "froid"): RevueRow {
  return {
    id, source: "jeu-test", sourceUrl: "https://exemple.test/a", groupe: "lockbit3",
    orgHint: hint, claimedAt: "2025-01-05T12:00:00Z", receivedAt: "2026-11-10T12:00:00Z",
    tlp: "RED",
    triage: { score: id * 3, bucket, suggested: "review", reasons: [{ label: "domaine déclaré", weight: 20 }] },
    candidates: id === 11
      ? [{ id: 7, name: "Mairie de Pessac", score: 0.86, via: "domain", city: "Pessac", dept: "33" }]
      : id === 12
        ? [{ id: 8, name: "ACME SAS", score: 0.42, via: "alias", city: "Bordeaux", dept: "33" }]
        : [],
    rejectRule: null, city: null, dept: null, review: [],
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
    counts: { pending: rows.length }, tookMs: 12,
  };
}
let queueBody: RevueQueue = payload();

g.fetch = async (input: unknown, init?: { method?: string; body?: string }) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  calls.push({ url, method, body: init?.body ? JSON.parse(init.body) as Record<string, unknown> : null });
  if (url.includes("/api/review/queue")) {
    if (holdQueue) {
      holdQueue = false;
      const gate = Promise.withResolvers<void>();
      releaseQueue = () => gate.resolve();
      await gate.promise;
    }
    const ok = queueStatus === 200;
    return {
      ok, status: queueStatus,
      json: async () => (ok ? queueBody : queueErrorBody),
    };
  }
  if (/\/api\/review\/\d+\/decision/.test(url)) {
    const ok = decisionStatus === 200;
    return {
      ok, status: decisionStatus,
      json: async () => (ok ? { ok: true, status: "promoted" } : decisionErrorBody),
    };
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
async function settle(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  await act(async () => { await promise; });
  await flush();
}

async function mount(options: { canWrite?: boolean; server?: boolean; url?: ReviewUrlState } = {}): Promise<void> {
  await act(async () => {
    root = createRoot(container);
    root.render(
      <ReviewView
        canWrite={options.canWrite ?? true}
        server={options.server ?? true}
        onUnauthorized={() => { unauthorized++; }}
        onOpenOrg={(id) => { opened.push(id); }}
        urlState={options.url ?? urlState}
        onUrlStateChange={persistUrl}
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
  return calls.filter((item) => item.url.includes("/api/review/queue")).length;
}
function decisionCalls(): number {
  return calls.filter((item) => item.url.includes("/decision")).length;
}

async function main(): Promise<void> {
  const react = await import("react");
  const reactDom = await import("react-dom/client");
  const view = await import("../src/components/ReviewView");
  act = react.act;
  createRoot = reactDom.createRoot;
  ReviewView = view.default;

  // --- état d'URL : aller-retour et validation --------------------------
  const deep = parseHash("#/review?q=acme&bucket=tiede");
  check("URL revue : q et bucket relus", deep.view === "review"
    && deep.review.q === "acme" && deep.review.bucket === "tiede", deep.review);
  check("URL revue : sérialisation complète", toHash(deep) === "#/review?q=acme&bucket=tiede", toHash(deep));
  check("URL revue : bucket invalide neutralisé", parseHash("#/review?bucket=mordor").review.bucket === "");
  check("URL revue : q ne contamine pas l'annuaire", parseHash("#/review?q=acme").directory.q === "");

  // --- chargement puis file rendue --------------------------------------
  holdQueue = true;
  await mount();
  check("chargement affiché", (container.textContent ?? "").includes("Chargement de la file de revue"));
  const firstGet = lastCall("/api/review/queue");
  check("GET /api/review/queue en 50 par page", firstGet?.url.includes("limit=50") === true && firstGet?.url.includes("page=0") === true, firstGet?.url);
  await release();
  check("trois lignes rendues", rows().length === 3);
  check("indice, source et date visibles", (container.textContent ?? "").includes("Commune de Pessac")
    && (container.textContent ?? "").includes("jeu-test")
    && (container.textContent ?? "").includes("2025-01-05"), (container.querySelector(".revue__row")?.textContent ?? "").slice(0, 300));
  check("candidats avec score affichés", (container.textContent ?? "").includes("Mairie de Pessac")
    && (container.textContent ?? "").includes("0.86"));

  // --- filtres : bucket, recherche debouncée et URL --------------------
  click(buttonIn(container.querySelector(".revue__buckets")!, "Tiède"));
  await flush();
  check("filtre bucket envoyé", lastCall("/api/review/queue")?.url.includes("bucket=tiede") === true, lastCall("/api/review/queue")?.url);
  check("URL après clic : bucket=tiede", dom.window.location.hash.includes("bucket=tiede"), dom.window.location.hash);

  setField(container.querySelector("#revue-q") as HTMLInputElement, "acme");
  check("URL après frappe : q=acme et bucket=tiede",
    dom.window.location.hash.includes("q=acme") && dom.window.location.hash.includes("bucket=tiede"),
    dom.window.location.hash);
  check("aucun appel API avant la fin du debounce",
    lastCall("/api/review/queue")?.url.includes("q=acme") !== true, lastCall("/api/review/queue")?.url);
  await settle(340);
  check("recherche q envoyée après 300 ms et page remise à zéro",
    lastCall("/api/review/queue")?.url.includes("q=acme") === true
      && lastCall("/api/review/queue")?.url.includes("page=0") === true, lastCall("/api/review/queue")?.url);

  setField(container.querySelector("#revue-q") as HTMLInputElement, "");
  await settle(340);
  click(buttonIn(container.querySelector(".revue__buckets")!, "Tous"));
  await flush();
  check("URL nettoyée quand les filtres reviennent au défaut", dom.window.location.hash === "#/review", dom.window.location.hash);

  // --- états erreur et vide --------------------------------------------
  queueStatus = 500;
  click(buttonIn(container.querySelector(".revue__buckets")!, "Froid"));
  await flush();
  check("message d'erreur affiché", (container.querySelector(".revue__error")?.textContent ?? "").includes("file indisponible"));
  queueStatus = 200;
  click(buttonIn(container.querySelector(".revue__buckets")!, "Tous"));
  await flush();

  queueBody = payload([]);
  click(buttonIn(container.querySelector(".revue__buckets")!, "Chaud"));
  await flush();
  check("compteur de résultats reflète la file filtrée",
    (container.querySelector(".revue__count")?.textContent ?? "").includes("0 résultat"),
    container.querySelector(".revue__count")?.textContent);

  queueBody = payload();
  click(buttonIn(container.querySelector(".revue__buckets")!, "Tous"));
  await flush();

  // --- accepter : motif libre + orgId choisi ---------------------------
  const beforeDecision = queueCalls();
  click(buttonIn(rowByHint("Commune de Pessac"), "Accepter"));
  await flush();
  let form = container.querySelector(".revue__decision")!;
  let reason = form.querySelector("textarea") as HTMLTextAreaElement;
  check("motif vide à l'ouverture", reason.value === "", reason.value);
  check("confirmation bloquée sans motif", buttonIn(form, "Confirmer").disabled);
  setField(reason, "domaine confirmé au registre");
  await flush();
  check("confirmation bloquée sans organisation choisie", buttonIn(form, "Confirmer").disabled);
  const radio = form.querySelector("input[type=radio]") as HTMLInputElement;
  check("radio candidat présent", radio !== null && radio.value === "7");
  click(radio);
  await flush();
  check("confirmation activée après motif et candidat", !buttonIn(form, "Confirmer").disabled);
  click(buttonIn(form, "Confirmer"));
  await flush();
  const accepted = lastCall("/decision");
  check("POST accepter avec le motif saisi et l'orgId choisi",
    accepted?.url === "/api/review/11/decision"
      && JSON.stringify(accepted?.body) === JSON.stringify({ decision: "accepter", raison: "domaine confirmé au registre", orgId: 7 }),
    accepted);
  check("la ligne décidée disparaît sans recharger la file",
    rows().length === 2 && queueCalls() === beforeDecision, { lignes: rows().length, gets: queueCalls() - beforeDecision });

  // --- refuser : aucun orgId -------------------------------------------
  click(buttonIn(rowByHint("acme.com"), "Refuser"));
  await flush();
  form = container.querySelector(".revue__decision")!;
  reason = form.querySelector("textarea") as HTMLTextAreaElement;
  check("motif revolé vide pour une nouvelle décision", reason.value === "");
  setField(reason, "hors périmètre régional");
  await flush();
  check("aucune organisation à choisir pour refuser", form.querySelector("input[type=radio]") === null);
  click(buttonIn(form, "Confirmer"));
  await flush();
  const refused = lastCall("/decision");
  check("POST refuser sans orgId",
    JSON.stringify(refused?.body) === JSON.stringify({ decision: "refuser", raison: "hors périmètre régional" }), refused?.body);
  check("deuxième ligne retirée", rows().length === 1);

  // --- créer : aucun orgId, motif libre --------------------------------
  click(buttonIn(rowByHint("autre.fr"), "Créer cette organisation"));
  await flush();
  form = container.querySelector(".revue__decision")!;
  reason = form.querySelector("textarea") as HTMLTextAreaElement;
  setField(reason, "organisation absente du référentiel");
  await flush();
  click(buttonIn(form, "Confirmer"));
  await flush();
  const created = lastCall("/decision");
  check("POST creer sans orgId",
    JSON.stringify(created?.body) === JSON.stringify({ decision: "creer", raison: "organisation absente du référentiel" }), created?.body);
  check("toutes les décisions ont un motif saisi",
    [accepted, refused, created].every((call) => typeof call?.body?.raison === "string" && String(call.body.raison).length > 0)
      && new Set([accepted?.body?.raison, refused?.body?.raison, created?.body?.raison]).size === 3);
  check("dernière ligne retirée, état vide visible",
    rows().length === 0 && (container.textContent ?? "").includes("Aucune revendication à revoir"));
  check("trois décisions envoyées, aucune relecture de la file", decisionCalls() === 3 && queueCalls() === beforeDecision);

  // --- erreur de décision : la ligne reste -----------------------------
  click(buttonIn(container.querySelector(".revue__buckets")!, "Chaud"));
  await flush();
  const beforeFailed = rows().length;
  decisionStatus = 400;
  click(buttonIn(rowByHint("autre.fr"), "Refuser"));
  await flush();
  form = container.querySelector(".revue__decision")!;
  setField(form.querySelector("textarea") as HTMLTextAreaElement, "motif valide");
  await flush();
  click(buttonIn(form, "Confirmer"));
  await flush();
  check("erreur de décision affichée", (container.querySelector(".revue__error")?.textContent ?? "").includes("décision refusée"));
  check("ligne conservée après échec", rows().length === beforeFailed);
  decisionStatus = 200;

  // --- 401 -------------------------------------------------------------
  queueStatus = 401;
  click(buttonIn(container.querySelector(".revue__buckets")!, "Tous"));
  await flush();
  check("401 signalée à l'application", unauthorized > 0);
  check("401 : message d'erreur rendu", (container.querySelector(".revue__error")?.textContent ?? "").includes("file indisponible"));
  queueStatus = 200;

  // --- lien profond : l'URL pilote les filtres au montage ---------------
  await unmount();
  persistUrl({ q: "pessac", bucket: "chaud" });
  calls.length = 0;
  await mount();
  check("lien profond : recherche reprise de l'URL",
    (container.querySelector("#revue-q") as HTMLInputElement)?.value === "pessac");
  check("lien profond : seau repris de l'URL",
    buttonIn(container.querySelector(".revue__buckets")!, "Chaud").getAttribute("aria-pressed") === "true");
  check("lien profond : filtres envoyés à l'API",
    lastCall("/api/review/queue")?.url.includes("q=pessac") === true
      && lastCall("/api/review/queue")?.url.includes("bucket=chaud") === true,
    lastCall("/api/review/queue")?.url);
  await unmount();
  persistUrl({ q: "", bucket: "" });

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
  check("sans API : état explicite", (container.textContent ?? "").includes("exige l'API"));
  await unmount();

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
