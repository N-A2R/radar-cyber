/** Chargement idempotent des candidats presse dans la file de revue. */
import { query } from "../db.js";
import { candidatsDepuisArticles, type ArticlePresse } from "./candidats-presse.js";

export async function importerCandidats(articles: ArticlePresse[]): Promise<{ inserts: number; existants: number }> {
  const candidats = candidatsDepuisArticles(articles);
  let inserts = 0;
  let existants = 0;
  for (const candidat of candidats) {
    const result = await query(
      `INSERT INTO presse_candidat
         (cle, titre, extrait, url, date_publication, source, commune, departement,
          org_proposee, score_confiance, signaux)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
       ON CONFLICT (cle) DO NOTHING`,
      [
        candidat.cle, candidat.titre, candidat.extrait, candidat.url,
        candidat.datePublication, candidat.source, candidat.commune, candidat.departement,
        candidat.orgProposee, candidat.scoreConfiance, JSON.stringify(candidat.signaux),
      ],
    );
    if (result.rowCount === 1) inserts += 1;
    else existants += 1;
  }
  return { inserts, existants };
}
