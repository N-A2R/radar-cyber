/**
 * Test unitaire du tri du registre par dernière production (croissant).
 *
 * Ce que le typecheck ne voit pas : « jamais produit » doit ouvrir la liste,
 * puis du fait le plus ancien au plus récent, et un serveur qui n'envoie pas
 * encore `lastEventAt` doit retomber sur `lastOkAt` sans classer la source
 * comme « jamais ». Le rendu SSR vérifie que la vue utilise bien ce tri.
 */
import { renderToStaticMarkup } from "react-dom/server";
import SourcesView, {
  countSourcesRouges,
  isSourceRouge,
  lastProductionAt,
  sortByLastProduction,
} from "../src/components/SourcesView";
import type { Source } from "../src/api";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const base: Source = {
  id: "base",
  name: "Base",
  family: "cti",
  url: "https://example.invalid",
  kind: "narrative",
  format: "rss",
  enabled: true,
  intervalSec: 3600,
  lastOkAt: null,
  lastErrorAt: null,
  lastError: null,
  itemsTotal: null,
  lastItems: null,
  ok: false,
  disabledAt: null,
  disabledReason: null,
  entrees: null,
  rejets: null,
  evenements30j: 0,
  evenementsTotal: 0,
  dernierRun: null,
  dernierRunStatut: null,
  rendement: null,
  motifs: null,
  motifDominant: null,
};

const jamais: Source = { ...base, id: "jamais", name: "Jamais produit" };
const ancienne: Source = {
  ...base,
  id: "ancienne",
  name: "Ancienne",
  lastOkAt: "2026-10-01T08:00:00Z",
  lastEventAt: "2026-10-02T08:00:00Z",
};
const intermediaire: Source = {
  ...base,
  id: "intermediaire",
  name: "Intermédiaire",
  lastEventAt: "2026-11-10T08:00:00Z",
};
const recente: Source = {
  ...base,
  id: "recente",
  name: "Récente",
  lastEventAt: "2026-11-20T08:00:00Z",
};
// Serveur antérieur : pas de `lastEventAt`, on lit le dernier succès.
const ancienneSansChamp: Source = {
  ...base,
  id: "ancienne-sans-champ",
  name: "Ancienne sans champ",
  lastOkAt: "2026-11-05T08:00:00Z",
};
const aExAequo: Source = {
  ...base,
  id: "a",
  name: "A à égalité",
  lastEventAt: "2026-11-01T08:00:00Z",
};
const bExAequo: Source = {
  ...base,
  id: "b",
  name: "B à égalité",
  lastEventAt: "2026-11-01T08:00:00Z",
};

const sources = [recente, intermediaire, jamais, aExAequo, ancienneSansChamp, bExAequo, ancienne];
const ordreAttendu = [
  "Jamais produit",
  "Ancienne",
  "A à égalité",
  "B à égalité",
  "Ancienne sans champ",
  "Intermédiaire",
  "Récente",
];

const triees = sortByLastProduction(sources);
check(
  "tri croissant par dernière production",
  triees.map((s) => s.name).join(" | ") === ordreAttendu.join(" | "),
  triees.map((s) => s.name).join(" | "),
);
check("le tri ne mute pas la liste d'origine", sources[0] === recente);
check("jamais produit en tête", triees[0] === jamais);
check("le plus récent en fin", triees[triees.length - 1] === recente);
check(
  "repli sur lastOkAt quand lastEventAt est absent",
  lastProductionAt(ancienneSansChamp) === ancienneSansChamp.lastOkAt,
);

// Le badge et le compteur suivent la même date que le tri.
const maintenant = Date.parse("2026-11-21T00:00:00Z");
const limit: Source = { ...base, id: "limite", lastEventAt: "2026-11-14T00:00:00Z" };
check("jamais produit est rouge", isSourceRouge(jamais, maintenant));
check("plus de 7 jours est rouge", isSourceRouge(ancienne, maintenant));
check("exactement 7 jours n'est pas rouge", !isSourceRouge(limit, maintenant));
check("moins de 7 jours n'est pas rouge", !isSourceRouge(recente, maintenant));
check(
  "compteur de sources rouges",
  countSourcesRouges([jamais, ancienne, limit, recente], maintenant) === 2,
);

// La vue doit utiliser le même ordre, pas seulement l'utilitaire.
const html = renderToStaticMarkup(
  <SourcesView sources={sources} loading={false} error={null} />,
);
const positions = ordreAttendu.map((name) => html.indexOf(name));
check(
  "le registre rend les lignes dans cet ordre",
  positions.every((p, i) => p !== -1 && (i === 0 || p > positions[i - 1])),
  positions.join(","),
);
check("compteur rendu dans l'en-tête", html.includes("6 sources rouges"), "toutes sauf la récente");
check("badge rouge rendu sur les lignes concernées", (html.match(/rouge · plus de 7 j/g) ?? []).length === 6);
check("un bouton relancer par ligne", (html.match(/aria-label="Relancer la collecte de /g) ?? []).length === sources.length);

console.log(failures === 0 ? "\ntri des sources : tout est vert" : `\ntri des sources : ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
