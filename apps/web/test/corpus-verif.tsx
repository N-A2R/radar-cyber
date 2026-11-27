/**
 * Vérification du rendu SSR de l'écran Corpus, sans API ni navigateur.
 *
 * Ce que le typecheck ne voit pas : est-ce que la réponse à « le corpus
 * progresse-t-il ? » est un chiffre visible, est-ce que les barres empilées
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

check("formatage français des grands nombres",
  formatCount(1_673_151).replace(/[\u202f\u00a0]/g, " ") === "1 673 151");
check("pourcentage mesuré, jamais arrondi à zéro", formatPercent(0.0053) === "0,01\u00a0%");
check("pourcentage non mesurable explicite", formatPercent(null) === "non mesurable");

const html = render();
check("titres de sections en français", html.includes("<h1>Corpus</h1>")
  && html.includes("Le corpus progresse-t-il ?")
  && html.includes("Sources par département")
  && html.includes("Organisations avec un domaine")
  && html.includes("20 derniers incidents du corpus"));
check("réponse chiffrée à la question de croissance",
  html.includes(`+${formatCount(1281)}`) && html.includes("événements ingérés lors des 24 dernières heures"));
check("comparaison avec la période précédente",
  html.includes(formatCount(4506)) && html.includes(`−${formatCount(3225)}`) && html.includes(`−${formatPercent(71.6)}`));
check("période de mesure datée et traçable",
  html.includes("depuis le dernier rapport de 24 h") && html.includes("2026-11-21T18:00:00.000Z"));

check("barres empilées : deux départements", (html.match(/class="[^"]*\bcorpus__bar-row\b[^"]*"/g) ?? []).length === 2);
check("segments : trois familles sur la Gironde",
  (html.match(/data-family="presse"/g) ?? []).length >= 2
  && html.includes('aria-label="Gironde : 4 sources. Presse : 2, Renseignement sur les menaces : 1, Rançongiciel : 1"'));
check("largeur des segments proportionnelle au compte", html.includes("width:50%") && html.includes("width:25%"));
check("sources non localisées affichées, pas supprimées", html.includes("Not localised"));
check("réserve sur l'inférence départementale", html.includes("sans ambiguïté"));

check("jauge : rôle, valeur et texte lisible",
  html.includes('role="progressbar"')
  && html.includes('aria-valuenow="0.0053"')
  && html.includes(`aria-valuetext="${formatCount(88)} sur ${formatCount(1_673_151)} organisations"`)
  && html.includes("0,01\u00a0%"));
check("jauge : dénominateur explicité",
  html.includes(`<strong>88</strong> organisations sur ${formatCount(1_673_151)}`));

const lignes = html.match(/<li class="corpus__incident"/g) ?? [];
check("20 incidents rendus", lignes.length === 20, `${lignes.length} lignes`);
check("liens de source cliquables hors page",
  (html.match(/class="corpus__incident-source" href="https:\/\/example\.invalid\/article\//g) ?? []).length === 19
  && (html.match(/target="_blank" rel="noopener noreferrer"/g) ?? []).length === 19);
check("premier incident et sa source", html.includes("Incident 1") && html.includes("Source 1"));
check("source absente : état explicite, pas un lien mort",
  html.includes("lien de source indisponible") && !html.includes('href=""'));
check("définitions des compteurs affichées",
  html.includes("incident confirmé ou une allégation tierce") && html.includes("event.collected_at"));

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
  vide.includes("Aucune source enregistrée")
  && vide.includes("Aucun incident dans le corpus")
  && vide.includes("non mesurable")
  && vide.includes("aucun pourcentage disponible"));
check("croissance nulle : zéro affiché, pas de signe trompeur",
  vide.includes('data-trend="flat"') && vide.includes(">0</div>"));

check("chargement et erreur : états distincts",
  render({ data: null, loading: true }).includes("Chargement des statistiques du corpus…")
  && render({ data: null }).includes("ne sont pas disponibles en mode démo")
  && render({ error: "backend down" }).includes("Impossible de charger les statistiques du corpus : backend down"));

if (failures > 0) {
  console.error(`${failures} vérification(s) en échec`);
  process.exit(1);
}
console.log("Toutes les vérifications du rendu Corpus sont passées.");
