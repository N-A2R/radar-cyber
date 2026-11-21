/**
 * Vérification du rendu de la section « supervision de la collecte ».
 *
 * Le jeu de données est un contrat d'affichage explicite, pas une mesure : on
 * vérifie que chaque champ renvoyé par l'API est rendu, avec son libellé et sa
 * couleur, sans recalcul dans le navigateur.
 *
 *   pnpm -F @radar/web run test:collecte
 */
import { renderToStaticMarkup } from "react-dom/server";
import CollecteMetricsView from "../src/components/CollecteMetricsView";
import type { CollecteMetrics } from "../src/api";
import { formatNumber } from "../src/components/SourcesView";

const metrics: CollecteMetrics = {
  generatedAt: "2026-11-21T12:00:00.000Z",
  fenetreHeures: 24,
  resume: {
    cycles: 12,
    cyclesEchoues: 2,
    dureeMoyenneMs: 45_000,
    dureeMaxMs: 180_000,
    sourcesOk: 34,
    sourcesError: 2,
    itemsIn: 421,
    itemsNew: 57,
    memoireMaxOctets: 268_435_456,
  },
  cycles: [
    {
      id: 91,
      startedAt: "2026-11-21T11:58:00.000Z",
      finishedAt: "2026-11-21T11:59:00.000Z",
      dureeMs: 60_000,
      statut: "degraded",
      sourcesOk: 12,
      sourcesError: 1,
      itemsIn: 40,
      itemsNew: 6,
      memoireRssOctets: 268_435_456,
      memoireHeapOctets: 90_000_000,
      memoireDeltaOctets: 4_096,
      erreur: null,
    },
    {
      id: 90,
      startedAt: "2026-11-21T11:50:00.000Z",
      finishedAt: "2026-11-21T11:51:00.000Z",
      dureeMs: 60_000,
      statut: "ok",
      sourcesOk: 22,
      sourcesError: 0,
      itemsIn: 381,
      itemsNew: 51,
      memoireRssOctets: 200_000_000,
      memoireHeapOctets: 70_000_000,
      memoireDeltaOctets: 1_024,
      erreur: null,
    },
  ],
  alertes: [
    {
      id: 7,
      ruleId: "supervision-collecte:source-muette",
      titre: "source quotidienne muette depuis 3 j",
      severite: 3,
      statut: "open",
      sourceId: "presse-exemple",
      cycleId: 91,
      createdAt: "2026-11-21T11:59:00.000Z",
    },
  ],
};

const html = renderToStaticMarkup(<CollecteMetricsView metrics={metrics} />);

function verifier(condition: boolean, message: string): void {
  if (!condition) throw new Error(`rendu : ${message}`);
  console.log(`ok — ${message}`);
}

verifier(html.includes("supervision de la collecte"), "titre de la section affiché");
verifier(html.includes("cycles / 24 h"), "période du résumé affichée");
verifier(html.includes(formatNumber(metrics.resume.itemsIn)), `éléments collectés affichés (${metrics.resume.itemsIn})`);
verifier(html.includes(`${formatNumber(metrics.resume.sourcesError)}`), `sources en erreur affichées (${metrics.resume.sourcesError})`);
verifier(html.includes("256 Mo"), "mémoire convertie en Mo");
verifier(html.includes("45.0 s"), "durée moyenne lisible");
for (const cycle of metrics.cycles) {
  verifier(html.includes(`#${cycle.id}`), `cycle ${cycle.id} affiché`);
  verifier(html.includes(`${cycle.sourcesOk} / ${cycle.sourcesError}`), `compteurs du cycle ${cycle.id} affichés`);
}
verifier((html.match(/data-tone="orange"/g) ?? []).length === 1, "cycle dégradé porte une couleur encadrée d'un libellé");
verifier(html.includes("dégradé"), "état dégradé explicitement libellé");
verifier(html.includes("source quotidienne muette depuis 3 j"), "alerte source muette affichée");
verifier(html.includes("presse-exemple"), "cible de l'alerte affichée");
console.log(`\nrendu vérifié sur ${metrics.cycles.length} cycles et ${metrics.alertes.length} alerte(s)`);
