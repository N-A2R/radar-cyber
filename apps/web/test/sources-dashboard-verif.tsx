/**
 * Vérification du rendu SSR de l'écran Sources dashboard, sans API ni
 * navigateur. Les valeurs affichées doivent être exactement celles de la
 * réponse : aucun chiffre par défaut, aucun pourcentage calculé côté front.
 */
import { renderToStaticMarkup } from "react-dom/server";
import SourcesDashboardView, {
  formatCount,
  formatDuration,
  formatYield,
  type SourcesDashboardViewProps,
} from "../src/components/SourcesDashboardView";
import type { SourceRendement, SourcesDashboard } from "../src/api";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

function render(props: Partial<SourcesDashboardViewProps> = {}): string {
  return renderToStaticMarkup(<SourcesDashboardView data={data} loading={false} error={null} {...props} />);
}

const meilleures: SourceRendement[] = Array.from({ length: 10 }, (_, i) => ({
  id: `top-${i}`,
  name: `Source ${i + 1}`,
  family: i % 2 === 0 ? "cti" : "presse",
  entrees: 100 - i * 5,
  evenements: 10 - i,
  rendement: Number(((10 - i) / (100 - i * 5)).toFixed(3)),
}));
const pires: SourceRendement[] = [
  { id: "bottom-zero", name: "Source sans événement", family: "cti", entrees: 50, evenements: 0, rendement: 0 },
  ...[...meilleures].reverse().slice(0, 9).map((source) => ({ ...source, id: `bottom-${source.id}` })),
];

const data: SourcesDashboard = {
  generatedAt: "2026-11-21T18:00:00.000Z",
  fenetreJours: 7,
  fenetreRendementJours: 30,
  seuilLenteMs: 30_000,
  limiteClassement: 10,
  totalSources: 5,
  etats: { ok200: 1, muette: 1, morte: 1, lente: 1, dormante: 1 },
  meilleures,
  pires,
  evolution: [
    { date: "2026-11-15", evenements: 0, entrees: 0, sourcesActives: 0 },
    { date: "2026-11-16", evenements: 3, entrees: 12, sourcesActives: 2 },
    { date: "2026-11-17", evenements: 8, entrees: 30, sourcesActives: 3 },
    { date: "2026-11-18", evenements: 1, entrees: 4, sourcesActives: 1 },
    { date: "2026-11-19", evenements: 0, entrees: 9, sourcesActives: 0 },
    { date: "2026-11-20", evenements: 5, entrees: 20, sourcesActives: 2 },
    { date: "2026-11-21", evenements: 12, entrees: 40, sourcesActives: 4 },
  ],
  collecte: { dureeTotaleMs: 65_000, runs: 6 },
};

check("formatage des grands nombres", formatCount(1_234_567) === "1,234,567");
check("rendement : ratio converti en pourcentage", formatYield(0.2) === "20.0%" && formatYield(0) === "0.0%");
check("rendement non mesurable explicite", formatYield(null) === "not measurable");
check("durée cumulée lisible", formatDuration(65_000) === "1 min 5 s" && formatDuration(3_721_000) === "1 h 2 min");
check("durée nulle mesurée", formatDuration(0) === "0 ms");

const html = render();
check("titre et provenance", html.includes("<h1>Sources dashboard</h1>")
  && html.includes("GET /api/sources/dashboard")
  && html.includes("2026-11-21T18:00:00.000Z"));
check("fenêtres et seuil de la mesure affichés",
  html.includes("states 7 d") && html.includes("yield 30 d") && html.includes("30,000 ms"));

for (const [etat, count] of Object.entries(data.etats)) {
  const motif = new RegExp(`data-etat="${etat}"[^>]*>.*?<dd>${count}</dd>`, "s");
  check(`état ${etat} : compte exact`, motif.test(html));
}
check("définitions des états affichées",
  html.includes("Explicitly declared dead") && html.includes("not proven healthy")
  && html.includes("partition the declared sources"));

check("temps de collecte cumulé : valeur lisible et valeur exacte",
  html.includes("1 min 5 s") && html.includes("65,000 ms summed over 6 finished runs"));
check("réserve sur le temps cumulé", html.includes("cumulative collector time, not wall-clock time"));

check("évolution : sept jours, dont les zéro",
  (html.match(/<time dateTime="/g) ?? []).length === 7
  && html.includes('dateTime="2026-11-15"') && html.includes('dateTime="2026-11-21"')
  && html.includes("2026-11-15</time></td><td class=\"sdb__num\">0</td>"));
check("évolution : colonnes mesurées",
  html.includes("Sources with events") && html.includes(">12</td>") && html.includes(">40</td>"));

check("classements : dix meilleures et dix pires",
  (html.match(/class="sdb__rank"/g) ?? []).length === 20
  && html.includes("10 best sources by yield") && html.includes("10 worst sources by yield"));
check("meilleure source : nom, entrées, événements et rendement",
  html.includes("Source 1") && html.includes(">100</td>") && html.includes(">10.0%</td>"));
check("pire source : zéro affiché, pas une donnée absente", html.includes(">0.0%</td>"));
check("définition du rendement et du non mesurable",
  html.includes("Yield = events retained over entries read") && html.includes("not measurable” means no entry was"));

const vide = render({
  data: {
    ...data,
    totalSources: 0,
    etats: { ok200: 0, muette: 0, morte: 0, lente: 0, dormante: 0 },
    meilleures: [],
    pires: [],
    evolution: [],
    collecte: { dureeTotaleMs: 0, runs: 0 },
  },
});
check("états vides explicites",
  vide.includes("No source has produced a measurable yield") && vide.includes("No daily measurement available")
  && vide.includes("0 ms summed over 0 finished runs"));

check("chargement, erreur et absence de données : états distincts",
  render({ data: null, loading: true }).includes("Loading the sources dashboard…")
  && render({ data: null }).includes("not available in demo mode")
  && render({ error: "backend down" }).includes("Could not load the sources dashboard: backend down"));

if (failures > 0) {
  console.error(`${failures} vérification(s) en échec`);
  process.exit(1);
}
console.log("Toutes les vérifications du rendu Sources dashboard sont passées.");
