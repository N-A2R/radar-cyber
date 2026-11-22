/**
 * Résultat de la vérification HTTP exhaustive des sources.
 *
 * La table `source_verification` conserve l'historique des passages ; cette
 * route lit la dernière mesure par source et publie les quatre comptes
 * demandés (200, muettes, mortes, lentes > 5 s) ainsi que la liste nommée des
 * sources à débrancher. Aucune mesure n'est calculée ici : tout vient des
 * lignes écrites par `scripts/verifier-sources-http.mts`.
 */
import type { FastifyInstance } from "fastify";
import { query } from "../db.js";

type Etat = "ok200" | "muette" | "morte" | "lente";

interface LigneVerification {
  id: string;
  nom: string;
  url: string;
  format: string;
  code_http: number | null;
  content_type: string | null;
  items: number | null;
  derniere_item_at: Date | string | null;
  ms: number | null;
  verifie_at: Date | string | null;
  etat: Etat | null;
  motif: string | null;
}

const SQL = `
WITH dernier AS (
  SELECT DISTINCT ON (source_id) *
  FROM source_verification
  ORDER BY source_id, verifie_at DESC, id DESC
)
SELECT s.id, s.name AS nom, s.url, s.format,
       d.code_http, d.content_type, d.items,
       d.derniere_item_at, d.ms, d.verifie_at, d.etat, d.motif
FROM source s
LEFT JOIN dernier d ON d.source_id = s.id
ORDER BY s.id
`;

function iso(valeur: Date | string | null): string | null {
  if (valeur === null) return null;
  return valeur instanceof Date ? valeur.toISOString() : new Date(valeur).toISOString();
}

export default async function sourcesVerificationRoute(app: FastifyInstance): Promise<void> {
  app.get("/sources/verification", async () => {
    const lignes = (await query<LigneVerification>(SQL)).rows;
    const Sources = lignes.map((l) => ({
      id: l.id,
      nom: l.nom,
      url: l.url,
      format: l.format,
      code_http: l.code_http,
      content_type: l.content_type,
      items: l.items ?? 0,
      derniere_item_at: iso(l.derniere_item_at),
      ms: l.ms,
      verifie_at: iso(l.verifie_at),
      etat: l.etat,
      motif: l.motif,
    }));
    const compte = (etat: Etat) => Sources.filter((s) => s.etat === etat).length;
    const verifiees = Sources.filter((s) => s.verifie_at !== null).length;
    const aDebrancher = Sources.filter((s) => s.etat === "morte" || s.etat === "muette").map((s) => ({
      id: s.id,
      nom: s.nom,
      url: s.url,
      etat: s.etat,
      motif: s.motif,
      code_http: s.code_http,
      items: s.items,
      ms: s.ms,
    }));
    const dates = Sources.map((s) => s.verifie_at).filter((d): d is string => d !== null).sort();

    return {
      verifie_at: dates.length > 0 ? dates[dates.length - 1] : null,
      total_sources: Sources.length,
      verifiees,
      couverture_pct: Sources.length === 0 ? 0 : Math.round((10000 * verifiees) / Sources.length) / 100,
      resume: {
        "200": compte("ok200"),
        muettes: compte("muette"),
        mortes: compte("morte"),
        lentes: compte("lente"),
      },
      a_debrancher: aDebrancher,
      sources: Sources,
    };
  });
}
