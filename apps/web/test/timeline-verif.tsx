/**
 * Test unitaire de l'agrégation de la timeline « Aujourd'hui ».
 *
 * L'instant de référence est fixé : une tranche est un fait vérifiable, pas
 * une fonction de l'heure à laquelle le test est lancé.
 */
import { renderToStaticMarkup } from "react-dom/server";
import TodayView, { aggregerTimeline } from "../src/components/TodayView";
import type { TodayEvent } from "../src/api";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const REFERENCE = Date.UTC(2026, 10, 21, 15, 37); // 2026-11-21T15:37:00Z
const DEBUT = Date.UTC(2026, 10, 20, 16, 0);
const FIN = Date.UTC(2026, 10, 21, 16, 0);
const DEUX_HEURES = 2 * 60 * 60 * 1000;

function ligne(id: string, date: string | null): TodayEvent {
  return {
    id, titre: `événement ${id}`, famille: "cti", severite: 2, date,
    dateSource: date ? "observee" : "collecte", source: "test", url: null,
    orgId: null, organisation: null, dept: null,
  };
}

const evenements = [
  ligne("a", "2026-11-21T14:05:00Z"),
  ligne("b", "2026-11-21T14:59:00Z"),
  ligne("c", "2026-11-21 15:00:00+01"), // 14:00 UTC, format renvoyé par l'API
  ligne("d", "2026-11-21T15:36:00Z"),
  ligne("e", "2026-11-21T12:00:00Z"),
  ligne("future", "2026-11-21T16:00:00Z"),
  ligne("ancien", "2026-11-20T15:59:59Z"),
  ligne("sans-date", null),
  ligne("invalide", "pas-une-date"),
];
const tranches = aggregerTimeline(evenements, REFERENCE);

check("douze tranches de deux heures", tranches.length === 12
  && tranches.every((t) => t.fin - t.debut === DEUX_HEURES),
  `bornes ${tranches[0]?.debut} → ${tranches[11]?.fin}`);
check("fenêtre glissante alignée sur UTC", tranches[0].debut === DEBUT && tranches[11].fin === FIN);
check("libellés UTC des bornes", tranches[0].label === "16h" && tranches[11].label === "14h",
  `${tranches[0].label} … ${tranches[11].label}`);
check("regroupement dans la tranche courante", tranches[11].evenements === 4,
  `tranche 14h : ${tranches[11].evenements}`);
check("borne basse incluse", tranches[10].evenements === 1,
  `tranche 12h : ${tranches[10].evenements}`);
check("hors fenêtre, dates absentes et invalides écartées",
  tranches.reduce((n, t) => n + t.evenements, 0) === 5);

const html = renderToStaticMarkup(
  <TodayView
    data={{ compteurs: { evenements24h: 5, organisations7j: 1, derniereCollecte: null }, evenements }}
    loading={false} error={null} family={null} dept={null}
    departements={[{ dept: "17", evenements: 3, organisations: 2 }, { dept: "33", evenements: 2, organisations: 1 }]}
    maintenant={REFERENCE}
    onFamily={() => {}} onDept={() => {}} onOpenOrg={() => {}} onOpenEvent={() => {}}
  />,
);
check("douze barres rendues", (html.match(/class="today__timeline-tranche"/g) ?? []).length === 12);
check("compte et heure visibles sans couleur", html.includes('aria-label="14h : 4 événements"')
  && html.includes(">16h</time>") && html.includes(">14h</time>"));
check("hauteur de barre proportionnelle au maximum", html.includes("height:100%"));
check("filtre de département alimenté par l'API", html.includes('value="17"') && html.includes('value="33"'));

const sansDonnees = renderToStaticMarkup(
  <TodayView data={null} loading error={null} family={null} dept={null} departements={[]}
    maintenant={REFERENCE}
    onFamily={() => {}} onDept={() => {}} onOpenOrg={() => {}} onOpenEvent={() => {}} />,
);
check("aucune barre avant la réponse", !sansDonnees.includes("today__timeline-tranche"));

console.log(failures === 0 ? "\nTimeline : tous les contrôles passent." : `\nTimeline : ${failures} contrôle(s) en échec.`);
process.exit(failures === 0 ? 0 : 1);
