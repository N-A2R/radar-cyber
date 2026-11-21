/**
 * Vérification du rendu de la vue « état du système » avec les VRAIES données
 * de l'API — aucun chiffre simulé, aucun mock.
 *
 *   RADAR_API_ORIGIN=http://127.0.0.1:18106 pnpm -F @radar/web run test:health
 */
import { renderToStaticMarkup } from "react-dom/server";
import HealthDetailView from "../src/components/HealthDetailView";
import type { HealthCauses, HealthDetail } from "../src/api";

const API = process.env.RADAR_API_ORIGIN ?? "http://127.0.0.1:18106";

const res = await fetch(`${API}/api/health/detail`);
if (!res.ok) throw new Error(`GET /api/health/detail → HTTP ${res.status}`);
const detail = (await res.json()) as HealthDetail;

const causesRes = await fetch(`${API}/api/health/causes`);
if (!causesRes.ok) throw new Error(`GET /api/health/causes → HTTP ${causesRes.status}`);
const causes = (await causesRes.json()) as HealthCauses;
const html = renderToStaticMarkup(<HealthDetailView detail={detail} causes={causes} />);

function verifier(condition: boolean, message: string): void {
  if (!condition) throw new Error(`rendu : ${message}`);
  console.log(`ok — ${message}`);
}

verifier(html.includes("état du système"), "titre de la section affiché");
verifier(
  html.includes(detail.events24h.toLocaleString("fr-FR")),
  `événements 24 h affichés (${detail.events24h})`,
);
verifier(
  html.includes(detail.orgs7j.toLocaleString("fr-FR")),
  `organisations reliées 7 j affichées (${detail.orgs7j})`,
);
for (const label of ["en attente", "revues", "promues"]) {
  verifier(html.includes(label), `file « ${label} » affichée`);
}
for (const tone of ["green", "orange", "red"] as const) {
  const n = (html.match(new RegExp(`data-tone="${tone}"`, "g")) ?? []).length;
  const attendu =
    detail.sources.bySource.filter((s) => s.tone === tone).length +
    detail.families.filter((f) => f.tone === tone).length;
  verifier(n === attendu, `${n} éléments ${tone} rendus (API : ${attendu})`);
}
verifier(html.includes("jamais produit"), "les sources sans fait portent un libellé explicite");
verifier(
  html.includes("moins de 24 h") && html.includes("plus de 7 jours"),
  "chaque couleur porte une étiquette lisible",
);

verifier(html.includes(`pourquoi ${causes.rouges.toLocaleString("fr-FR")} sources sont-elles rouges ?`), "titre de la répartition affiché");
verifier(html.includes(`${causes.sansTrace.toLocaleString("fr-FR")} sources rouges n’ont aucune trace`), "nombre de sources sans trace affiché");
for (const cause of causes.causes) {
  verifier(html.includes(cause.libelle), `libellé « ${cause.libelle} » affiché`);
  verifier(html.includes(cause.sources.toLocaleString("fr-FR")), `compte réel de « ${cause.code} » affiché (${cause.sources})`);
}
if (!causes.stockage.causeStockee) {
  verifier(
    html.includes(`${causes.stockage.champPropose.table}.${causes.stockage.champPropose.colonne}`),
    "champ manquant proposé à l'écran",
  );
}
for (const ex of causes.causes.flatMap((c) => c.exemples)) {
  verifier(html.includes(ex.source), `exemple réel affiché (${ex.source})`);
}
console.log(`\nrendu vérifié sur ${detail.sources.bySource.length} sources et ${detail.families.length} familles`);
