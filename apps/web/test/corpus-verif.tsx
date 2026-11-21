/**
 * Vérification du rendu SSR de l'écran Corpus, sans API ni navigateur.
 *
 * Ce que le typecheck ne voit pas : est-ce que la réponse à « est-ce que mon
 * corpus grossit ? » est un chiffre visible, est-ce que les barres empilées
 * portent les bonnes familles, est-ce que la jauge annonce sa mesure, et
 * est-ce que les 20 derniers incidents ont un lien de source cliquable ?
 */
import { renderToStaticMarkup } from "react-dom/server";
import CorpusView, { formatCount, formatPercent, type CorpusViewProps } from "../src/components/CorpusView";
import type { CorpusStats } from "../src/api";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

function render(props: Partial<CorpusViewProps> = {}): string {
  return renderToStaticMarkup(<CorpusView data={data} loading={false} error={null} {...props} />);
}

const data: CorpusStats = {
  generatedAt: "2026-11-21T18:00:00.000Z",
  windowHours: 24,
  totals: { sources: 312, sourcesLocalised: 280, organisations: 1_673_151, incidents: 1_732 },
  families: ["presse", "cti", "ransomware"],
  byDepartment: [
    {
      department: "33",
      label: "Gironde",
      total: 4,
      families: { presse: 2, cti: 1, ransomware: 1 },
    },
    {
      department: "",
      label: "Not localised",
      total: 2,
      families: { cti: 1, ransomware: 1 },
    },
  ],
  domainCoverage: { withDomain: 88, organisations: 1_673_151, percent: 0.0053 },
  sinceLastReport: {
    windowHours: 24,
    newEvents: 1281,
    previousEvents: 4506,
    change: -3225,
    percentChange: -71.6,
    comparedTo: "previous 24 hours",
  },
  recentIncidents: Array.from({ length: 20 }, (_, i) => ({
    id: String(9000 - i),
    title: `Incident ${i + 1}`,
    organisation: i % 2 === 0 ? `Organisation ${i + 1}` : null,
    department: i % 2 === 0 ? "33" : null,
    date: `2026-11-${String(21 - (i % 20)).padStart(2, "0")}`,
    type: i % 2 === 0 ? "confirmed_incident" : "third_party_claim",
    family: "presse",
    sourceName: `Source ${i + 1}`,
    sourceUrl: i === 19 ? null : `https://example.invalid/article/${i + 1}`,
  })),
};

check("formatage anglais des grands noms", formatCount(1_673_151) === "1,673,151");
check("pourcentage mesuré, jamais arrondi à zéro", formatPercent(0.0053) === "0.01%");
check("pourcentage non mesurable explicite", formatPercent(null) === "not measurable");

const html = render();
check("titre et vocabulaire anglais", html.includes("<h1>Corpus</h1>")
  && html.includes("Is the corpus growing?")
  && html.includes("Sources by department")
  && html.includes("Organisations with a domain")
  && html.includes("20 most recent corpus incidents"));
check("réponse chiffrée à la question de croissance",
  html.includes("+1,281") && html.includes("events ingested in the last 24 hours"));
check("comparaison avec la période précédente",
  html.includes("4,506") && html.includes("−3,225") && html.includes("−71.6%"));
check("période de mesure datée et traçable",
  html.includes("since the last 24 h report") && html.includes("2026-11-21T18:00:00.000Z"));

check("barres empilées : deux départements", (html.match(/class="corpus__bar-row"/g) ?? []).length === 2);
check("segments : trois familles sur la Gironde",
  (html.match(/data-family="presse"/g) ?? []).length >= 2
  && html.includes('aria-label="Gironde: 4 sources. Press: 2, Threat intel: 1, Ransomware: 1"'));
check("largeur des segments proportionnelle au compte", html.includes("width:50%") && html.includes("width:25%"));
check("sources non localisées affichées, pas supprimées", html.includes("Not localised"));
check("réserve sur l'inférence départementale", html.includes("unambiguous department"));

check("jauge : rôle, valeur et texte lisible",
  html.includes('role="progressbar"')
  && html.includes('aria-valuenow="0.0053"')
  && html.includes('aria-valuetext="88 of 1,673,151 organisations"')
  && html.includes("0.01%"));
check("jauge : dénominateur explicité", html.includes("<strong>88</strong> of 1,673,151 organisations"));

const lignes = html.match(/<li class="corpus__incident"/g) ?? [];
check("20 incidents rendus", lignes.length === 20, `${lignes.length} lignes`);
check("liens de source cliquables hors page",
  (html.match(/class="corpus__incident-source" href="https:\/\/example\.invalid\/article\//g) ?? []).length === 19
  && (html.match(/target="_blank" rel="noopener noreferrer"/g) ?? []).length === 19);
check("premier incident et sa source", html.includes("Incident 1") && html.includes("Source 1"));
check("source absente : état explicite, pas un lien mort",
  html.includes("source link unavailable") && !html.includes('href=""'));
check("définitions des compteurs affichées",
  html.includes("confirmed incident or a third-party claim") && html.includes("event.collected_at"));

const vide = render({
  data: {
    ...data,
    totals: { sources: 0, sourcesLocalised: 0, organisations: 0, incidents: 0 },
    families: [],
    byDepartment: [],
    domainCoverage: { withDomain: 0, organisations: 0, percent: null },
    sinceLastReport: { ...data.sinceLastReport, newEvents: 0, previousEvents: 0, change: 0, percentChange: null },
    recentIncidents: [],
  },
});
check("états vides explicites",
  vide.includes("No sources recorded yet.")
  && vide.includes("No incidents in the corpus yet.")
  && vide.includes("not measurable")
  && vide.includes("no percentage available"));
check("croissance nulle : zéro affiché, pas de signe trompeur",
  vide.includes('data-trend="flat"') && vide.includes(">0</div>"));

check("chargement et erreur : états distincts",
  render({ data: null, loading: true }).includes("Loading corpus statistics…")
  && render({ data: null }).includes("not available in demo mode")
  && render({ error: "backend down" }).includes("Could not load corpus statistics: backend down"));

if (failures > 0) {
  console.error(`${failures} vérification(s) en échec`);
  process.exit(1);
}
console.log("Toutes les vérifications du rendu Corpus sont passées.");
