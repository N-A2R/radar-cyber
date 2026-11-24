/**
 * Unit checks for the audit journal: pure filtering and SSR rendering.
 * No database, no browser — the components receive the same typed rows the
 * browser gets from GET /api/journal/review.
 */
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { JournalDecision } from "../src/api";
import JournalList, { DECISION_UNSPECIFIED } from "../src/components/JournalListe";
import JournalView, {
  filterJournal, journalApiParams, type JournalFilters,
} from "../src/components/JournalView";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const rows: JournalDecision[] = [
  {
    id: 46, kind: "review.decided", sujet: "quarantine:21",
    acteur: "humain:analyste@radar.local", horodatage: "2026-11-21 14:03:12+00",
    decision: "accepter", indice: "Hôpital de Pessac",
    raison: "alias verified on the official site", resume: "accept by analyste — alias verified",
    preuve: { decision: "accepter", reason: "alias verified on the official site", orgId: 101 },
  },
  {
    id: 45, kind: "review.decided", sujet: "quarantine:20",
    acteur: "HUMAIN:admin@radar.local", horodatage: "2026-11-21 11:20:00+00",
    decision: "refuser", indice: "Groupe fictif", raison: "claim outside the scope",
    resume: "reject by admin — claim outside the scope", preuve: { action: "reject", orgId: null },
  },
  {
    id: 44, kind: "org.created", sujet: "org:chu-bordeaux",
    acteur: "moteur:triage", horodatage: "2026-11-20 09:00:00+00",
    decision: "creer", indice: "CHU Bordeaux", raison: "official domain confirmed",
    resume: "organisation created from the claim CHU Bordeaux",
    preuve: { preuve: "https://www.chu-bordeaux.fr", orgId: 102, nomBrut: "CHU Bordeaux" },
  },
  {
    id: 43, kind: "org.changed", sujet: "org:chu-bordeaux",
    acteur: "moteur:triage", horodatage: "2026-11-20 07:12:00+00",
    decision: null, indice: "CHU Bordeaux", raison: "name completed",
    resume: "CHU Bordeaux : name completed",
    preuve: { changements: { name: { avant: null, apres: "CHU Bordeaux" } } },
  },
  {
    id: 42, kind: "alert.changed", sujet: "alert:rupture:effectif:77",
    acteur: "moteur:rupture@1", horodatage: "2026-11-19 18:30:00+00",
    decision: null, indice: "Institut Pasteur", raison: "staff drop detected",
    resume: "rupture : alert created — staff drop detected",
    preuve: { agent: "effectif", orgId: 77, score: 0.91 },
  },
  {
    id: 41, kind: "match.refuse", sujet: "quarantine:17",
    acteur: "humain:relecteur@radar.local", horodatage: "2026-11-19 08:15:00+00",
    decision: null, indice: "Association bidon", raison: "no public trace",
    resume: "rattachement refused by the precision rule",
    preuve: { regle: "PAS_DE_TRACE", quarantineId: 17 },
  },
];

const ids = (found: JournalDecision[]) => found.map((row) => row.id).join(",");
const filtre = (patch: JournalFilters) => filterJournal(rows, patch);

/* Pure filter: deterministic, side-effect free, original order preserved. */
check("actor: case-insensitive substring",
  ids(filtre({ actor: "ANALYSTE" })) === "46");
check("actor: substring in an already uppercase actor",
  ids(filtre({ actor: "Moteur:TRIAGE" })) === "44,43");
check("actor absent or blank: no restriction",
  ids(filtre({})) === "46,45,44,43,42,41" && ids(filtre({ actor: "  " })) === ids(filtre({})));
check("actor with no match: empty list", filtre({ actor: "robot" }).length === 0);

check("type: review decisions only",
  ids(filtre({ kind: "review" })) === "46,45");
check("type: publications only",
  ids(filtre({ kind: "publication" })) === "44,42");
check("type: corrections only",
  ids(filtre({ kind: "correction" })) === "43,41");
check("type: exact journal kind",
  ids(filtre({ kind: "org.created" })) === "44");
check("type: 'all' or blank: no restriction",
  ids(filtre({ kind: "all" })) === ids(filtre({})) && ids(filtre({ kind: "" })) === ids(filtre({})));

check("search: subject, summary and reason",
  ids(filtre({ q: "ALIAS VERIFIED" })) === "46"
  && ids(filtre({ q: "name completed" })) === "43"
  && ids(filtre({ q: "alert:rupture" })) === "42");
check("search: raw evidence (URL and rule)",
  ids(filtre({ q: "chu-bordeaux.fr" })) === "44"
  && ids(filtre({ q: "PAS_DE_TRACE" })) === "41");
check("search: actor", ids(filtre({ q: "relecteur" })) === "41");
check("search: blank or absent: no restriction",
  ids(filtre({ q: "  " })) === ids(filtre({})) && ids(filtre({ q: "nothing here" })) === "");

check("from bound only", ids(filtre({ from: "2026-11-20" })) === "46,45,44,43");
check("to bound only", ids(filtre({ to: "2026-11-20" })) === "44,43,42,41");
check("inclusive bounds on the same day",
  ids(filtre({ from: "2026-11-20", to: "2026-11-20" })) === "44,43");
check("distinct bounds",
  ids(filtre({ from: "2026-11-19", to: "2026-11-20" })) === "44,43,42,41");
check("range with no rows", filtre({ from: "2026-11-22", to: "2026-11-30" }).length === 0);

check("combination actor + type + period",
  ids(filtre({ actor: "humain", kind: "review", from: "2026-11-19", to: "2026-11-21" })) === "46,45");
check("combination search + correction",
  ids(filtre({ q: "PAS_DE_TRACE", kind: "correction" })) === "41");

const all = filtre({});
check("no filter: same rows, same order, same references, new array",
  all.length === rows.length && all.every((row, i) => row === rows[i]) && all !== rows);
check("blank fields: same result as no filter",
  ids(filtre({ actor: "", kind: "", q: "", from: "", to: "" })) === ids(all));

const before = JSON.stringify(rows);
const references = [...rows];
const filtered = filtre({ actor: "moteur", kind: "review" });
check("filtering does not mutate the source",
  filtered.length === 0 && JSON.stringify(rows) === before
  && rows.every((row, i) => row === references[i]));

check("API params: filter names and trimming",
  JSON.stringify(journalApiParams({ actor: " analyste ", q: " alias ", kind: "review", from: "2026-11-19", to: "2026-11-21" }))
  === JSON.stringify({ kind: "review", actor: "analyste", q: "alias", du: "2026-11-19", au: "2026-11-21" }));
check("API params: empty filters stay unset",
  JSON.stringify(journalApiParams({})) === JSON.stringify({ kind: "all", actor: undefined, q: undefined, du: undefined, au: undefined }));

/* SSR rendering: the same props as in the browser, without API or interaction. */
type Props = ComponentProps<typeof JournalList>;
function render(overrides: Partial<Props> = {}) {
  return renderToStaticMarkup(
    <JournalList
      rows={rows}
      total={rows.length}
      filters={{}}
      onFilterChange={() => {}}
      onReset={() => {}}
      loading={false}
      error={null}
      page={1}
      pageCount={2}
      onPrevious={() => {}}
      onNext={() => {}}
      selected={null}
      onSelect={() => {}}
      onCloseDetail={() => {}}
      onExport={() => {}}
      exporting={false}
      exportError={null}
      onRetry={() => {}}
      {...overrides}
    />,
  );
}

const html = render();
check("French column headers",
  ["Date (UTC)", "Type", "Acteur", "Décision", "Résumé"].every((col) => html.includes(`>${col}</th>`)));
check("actor and UTC timestamp rendered",
  html.includes("humain:analyste@radar.local")
  && html.includes('dateTime="2026-11-21 14:03:12+00"')
  && html.includes("2026-11-21 14:03 UTC"));
check("all three decision categories rendered",
  ["Décision de revue", "Organisation créée", "Correction d&#x27;organisation", "Changement d&#x27;alerte", "Rapprochement refusé"]
    .every((label) => html.includes(label)));
check("decisions are written out",
  (["accepter", "refuser", "creer"] as const).every((d) => html.includes(`data-decision="${d}"`))
  && html.includes("Acceptée") && html.includes("Refusée") && html.includes("Créée"));
check("summaries are rendered, newest first",
  html.indexOf("accept by analyste") < html.indexOf("reject by admin")
  && html.indexOf("reject by admin") < html.indexOf("organisation created from the claim")
  && html.includes("rattachement refused by the precision rule"));
check("result count and page label in French",
  html.includes("6 entrées — page 1 / 2"));

check("search, actor, type, period, reset and export controls",
  html.includes('id="journal-q"') && html.includes("sujet, acteur, motif, preuve…")
  && html.includes('id="journal-actor"') && html.includes('id="journal-kind"')
  && ["Tous les types", "Décisions de revue", "Publications", "Corrections"]
    .every((option) => html.includes(`>${option}</option>`))
  && html.includes('id="journal-from"') && html.includes('id="journal-to"')
  && html.includes(">Réinitialiser</button>") && html.includes("Exporter en CSV"));

check("first page: Previous disabled, Next enabled",
  /<button[^>]*disabled=""[^>]*>Précédent<\/button>/.test(html)
  && /<button(?![^>]*disabled)[^>]*>Suivant<\/button>/.test(html));
const lastPage = render({ page: 2 });
check("last page: Next disabled, Previous enabled",
  lastPage.includes("page 2 / 2")
  && /<button[^>]*disabled=""[^>]*>Suivant<\/button>/.test(lastPage)
  && /<button(?![^>]*disabled)[^>]*>Précédent<\/button>/.test(lastPage));

const filteredHtml = render({
  filters: { actor: "moteur", kind: "publication", q: "staff", from: "2026-11-19", to: "2026-11-21" },
  rows: [rows[4]], total: 1,
});
check("filters reflected in the fields",
  filteredHtml.includes('value="moteur"')
  && /<option(?=[^>]*value="publication")(?=[^>]*selected)[^>]*>/.test(filteredHtml));
check("search and period reflected in the fields",
  /id="journal-q"[^>]*value="staff"/.test(filteredHtml)
  && /id="journal-from"[^>]*value="2026-11-19"/.test(filteredHtml)
  && /id="journal-to"[^>]*value="2026-11-21"/.test(filteredHtml));
check("singular result label", filteredHtml.includes("1 entrée — page 1 / 2"));

const detail = render({ selected: rows[3] });
check("detail panel: metadata and unmodified summary",
  detail.includes("Détails de l&#x27;entrée de journal 43")
  && detail.includes("Entrée n°43") && detail.includes("Correction d&#x27;organisation")
  && detail.includes("moteur:triage") && detail.includes("Non précisée")
  && detail.includes("CHU Bordeaux : name completed") && detail.includes("name completed"));
check("detail panel is a native Drawer, not a faux modal",
  detail.includes("<dialog")
  && detail.includes('aria-label="Détails de l&#x27;entrée de journal 43"')
  && detail.includes('data-autofocus=""')
  && !detail.includes("journal__backdrop")
  && !detail.includes("journal__detail-wrap"));
check("detail panel: context from the payload",
  detail.includes(">Contexte</h3>") && detail.includes("changements")
  && detail.includes("&quot;avant&quot;") && detail.includes("&quot;apres&quot;"));
check("detail panel: explicit empty evidence",
  detail.includes(">Preuve</h3>") && detail.includes("Aucune preuve enregistrée pour cette entrée."));

const withProof = render({ selected: rows[2] });
check("detail panel: proof extracted from the payload",
  withProof.includes("https://www.chu-bordeaux.fr")
  && withProof.includes(">Preuve</h3>") && withProof.includes(">Contexte</h3>")
  && withProof.includes("nomBrut"));

check("proof keys are labelled in French, raw key kept in title",
  withProof.includes('title="preuve"') && withProof.includes(">Preuve</dt>")
  && withProof.includes('title="nomBrut"') && withProof.includes(">Nom brut</dt>")
  && !withProof.includes("<dt>nomBrut</dt>") && !withProof.includes("<dt>orgId</dt>"));

const loading = render({ rows: [], total: 0, loading: true });
check("loading state announced and controls disabled",
  loading.includes('role="status"') && loading.includes("Chargement du journal…")
  && (loading.match(/disabled=""/g) ?? []).length >= 3);
check("loading shows skeleton rows, never an empty count",
  (loading.match(/journal__row--squelette/g) ?? []).length >= 8
  && loading.includes("Chargement…") && !loading.includes("0 entrées")
  && !loading.includes("Aucune entrée de journal enregistrée"));

const error = render({ rows: [], total: 0, error: "/api/journal/review → 500" });
check("error shown without claiming the list is empty, with a retry",
  error.includes('role="alert"') && error.includes("API : /api/journal/review → 500")
  && error.includes(">Réessayer</button>")
  && !error.includes("Aucune entrée de journal enregistrée")
  && !error.includes("journal__row--squelette"));

const empty = render({ rows: [], total: 0, pageCount: 1 });
check("explicit empty state without filters",
  empty.includes("Aucune entrée de journal enregistrée pour l&#x27;instant.")
  && empty.includes("0 entrées — page 1 / 1") && !empty.includes('role="alert"'));
const noMatch = render({ rows: [], total: 0, pageCount: 1, filters: { q: "none" } });
check("explicit empty state with filters",
  noMatch.includes("Aucune entrée de journal ne correspond à ces filtres."));

const exportError = render({ exportError: "L'export CSV exige un accès administrateur." });
check("export error is distinct from the API error, in French",
  exportError.includes("L&#x27;export CSV exige un accès administrateur.")
  && exportError.includes("Exporter en CSV"));

const unspecified = render({
  rows: [{ ...rows[3] }], total: 1, pageCount: 1,
});
check("entry without decision stays readable",
  unspecified.includes("Non précisée") && unspecified.includes(`data-decision="${DECISION_UNSPECIFIED}"`));

const view = renderToStaticMarkup(<JournalView />);
check("screen mounted in loading state before the API answers",
  view.includes("Chargement du journal…") && view.includes("Journal d&#x27;audit")
  && view.includes("Exporter en CSV"));

console.log(failures === 0 ? "\nJournal: all checks pass." : `\nJournal: ${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
