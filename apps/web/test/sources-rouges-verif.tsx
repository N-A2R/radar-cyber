/**
 * Vérification SSR de la vue d'action « sources rouges » avec les VRAIES
 * données de GET /api/health/detail — aucun chiffre simulé.
 *
 *   RADAR_API_ORIGIN=http://127.0.0.1:8080 pnpm -F @radar/web run test:sources-rouges
 */
import { renderToStaticMarkup } from "react-dom/server";
import SourcesRougesView from "../src/components/SourcesRougesView";
import { RelanceResultat, type RelanceEtat } from "../src/components/RelancerButton";
import { formatRelative, isSourceRouge, lastProductionAt } from "../src/components/SourcesView";
import type { HealthDetail, Source } from "../src/api";

const API = process.env.RADAR_API_ORIGIN ?? "http://127.0.0.1:8080";

function verifier(condition: boolean, message: string): void {
  if (!condition) throw new Error(`rendu : ${message}`);
  console.log(`ok — ${message}`);
}

function date(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

const res = await fetch(`${API}/api/health/detail`);
if (!res.ok) throw new Error(`GET /api/health/detail → HTTP ${res.status}`);
const detail = (await res.json()) as HealthDetail;

const registreRes = await fetch(`${API}/api/sources`);
if (!registreRes.ok) throw new Error(`GET /api/sources → HTTP ${registreRes.status}`);
const registre = (await registreRes.json()) as Source[];

const html = renderToStaticMarkup(
  <SourcesRougesView detail={detail} sources={registre} onRelance={async () => ({ inserted: 0 })} />,
);

const attendues = registre
  .filter((s) => isSourceRouge(s))
  .sort((a, b) => {
    const aAt = date(lastProductionAt(a));
    const bAt = date(lastProductionAt(b));
    if (aAt === null && bAt === null) return a.name.localeCompare(b.name, "fr");
    if (aAt === null) return -1;
    if (bAt === null) return 1;
    return aAt - bAt || a.name.localeCompare(b.name, "fr");
  });

verifier(html.includes("sources rouges"), "titre de la vue d'action affiché");
verifier(
  html.includes(`${attendues.length} sources sans fait depuis plus de 7 jours sur ${detail.sources.declared} déclarées`),
  `compte réel rendu (${attendues.length} / ${detail.sources.declared})`,
);
verifier(
  html.includes("triées par dernière production, du plus ancien fait au plus récent"),
  "tri par dernière production explicité",
);
const boutons = (html.match(/aria-label="Relancer la collecte de /g) ?? []).length;
verifier(boutons === attendues.length, `${boutons} boutons Relancer rendus (API : ${attendues.length})`);

for (const colonne of ["état", "dernier passage", "dernier événement", "action"]) {
  verifier(html.includes(`<th scope="col">${colonne}</th>`), `colonne « ${colonne} » présente`);
}

const premiere = attendues[0];
const derniere = attendues[attendues.length - 1];
if (premiere && derniere) {
  const i = html.indexOf(`aria-label="Relancer la collecte de `);
  verifier(html.slice(0, i).includes(premiere.name), `première ligne = ${premiere.name} (jamais produit)`);
  verifier(html.includes(derniere.name), `dernière ligne = ${derniere.name} (plus récente des rouges)`);
  verifier(
    lastProductionAt(premiere) === null && html.includes(formatRelative(premiere.dernierRun)),
    "dernier passage réel de la première source affichée",
  );
  verifier(html.includes(formatRelative(derniere.lastEventAt ?? null)), "dernier événement réel affiché");
}

const desactivees = attendues.filter((s) => !s.enabled).length;
verifier(
  (html.match(/disabled="" aria-label="Relancer la collecte de/g) ?? []).length === desactivees,
  `${desactivees} sources désactivées ont leur bouton désactivé`,
);

/** Les trois états du résultat sont rendus tels quels, sans simulation de réseau. */
const etats: [RelanceEtat, string][] = [
  [{ kind: "succes", inserted: 3, skipped: 0 }, "succès · 3 nouveaux événements"],
  [{ kind: "vide" }, "0 nouvel événement"],
  [{ kind: "erreur", message: "/api/exemple → 500" }, "erreur · /api/exemple → 500"],
];
for (const [etat, texte] of etats) {
  const resultat = renderToStaticMarkup(<RelanceResultat etat={etat} />);
  const brut = resultat.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, "");
  verifier(brut.includes(texte), `résultat « ${texte} » affiché`);
}
verifier(
  renderToStaticMarkup(<RelanceResultat etat={{ kind: "erreur", message: "x" }} />).includes('role="alert"'),
  "l'erreur de relance est annoncée comme alerte",
);

console.log(`\nSSR vérifié sur ${attendues.length} sources rouges réelles`);
