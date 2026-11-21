/**
 * Rapport mensuel régional — agrégation et rendu déterministes.
 *
 * Tout chiffre affiché vient d'une requête explicite bornée par le mois :
 * aucune horloge murale, aucun `now()` SQL, aucun ordre non trié. Le résultat
 * est donc octet pour octet identique sur une base inchangée.
 *
 * La couverture affichée ici est une couverture *de rattachement* : part des
 * revendications/incidents du mois que le radar a su rattacher à une
 * organisation des douze départements de Nouvelle-Aquitaine. Ce n'est pas le
 * taux du corpus de référence (`docs/couverture-mesuree.md`), qui mesure la
 * collecte passée d'articles connus ; les deux chiffres ne sont pas comparables.
 */
import { DEPT_LABELS } from "../collectors/relevance.js";

export const DEPTS_NA: readonly string[] = Object.keys(DEPT_LABELS).sort((a, b) => a.localeCompare(b, "fr"));

export type ExecuteurSQL = <T>(texte: string, params?: unknown[]) => Promise<{ rows: T[] }>;

export type DepartementLigne = { dept: string; incidents: number; orgs: number };
export type SecteurLigne = { secteur: string; incidents: number };
export type SourceLigne = { source_id: string; incidents: number };
export type IncidentLigne = {
	id: string;
	titre: string;
	organisation: string;
	dept: string | null;
	secteur: string;
	date: string;
	famille: string;
	severite: number;
	source_id: string;
	source_url: string | null;
};

export type DonneesRapportMensuel = {
	mois: string;
	derniereCollecte: string | null;
	incidents: number;
	departements: DepartementLigne[];
	secteurs: SecteurLigne[];
	sources: SourceLigne[];
	delaiHeures: number | null;
	delaiEffectif: number;
	couverture: { rattaches: number; total: number; pourcent: number | null };
	top: IncidentLigne[];
};

export function fenetreMois(mois: string): { debut: string; fin: string } {
	if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mois)) {
		throw new Error(`mois invalide : ${mois} (attendu YYYY-MM)`);
	}
	const annee = Number(mois.slice(0, 4));
	const numero = Number(mois.slice(5, 7));
	const debut = new Date(Date.UTC(annee, numero - 1, 1));
	const fin = new Date(Date.UTC(annee, numero, 1));
	return { debut: debut.toISOString().slice(0, 10), fin: fin.toISOString().slice(0, 10) };
}

/**
 * Jeu d'incidents régionaux du mois. Les revendications et les incidents
 * confirmés sont comptés ; les signaux ambiants et indicateurs techniques ne
 * sont pas des incidents. Le filtre TLP écarte les données non publiables.
 */
const CTE_REGIONAL = `
WITH regional AS (
	SELECT e.id, e.title, e.family, e.severity, e.observed_at, e.collected_at,
	       e.source_id, e.source_url, e.org_id,
	       o.name AS org_name, o.dept, o.sector, o.kind
	  FROM event e
	  JOIN org o ON o.id = e.org_id
	 WHERE coalesce(e.observed_at, e.collected_at) >= $1::date
	   AND coalesce(e.observed_at, e.collected_at) <  $2::date
	   AND e.assertion_type IN ('confirmed_incident', 'third_party_claim')
	   AND e.tlp IS DISTINCT FROM 'TLP:RED'
	   AND e.tlp IS DISTINCT FROM 'RED'
	   AND o.dept = ANY($3::text[])
)`;

const CTE_TOUT = `tout AS (
	SELECT e.id, e.assertion_type
	  FROM event e
	 WHERE coalesce(e.observed_at, e.collected_at) >= $1::date
	   AND coalesce(e.observed_at, e.collected_at) <  $2::date
	   AND e.assertion_type IN ('confirmed_incident', 'third_party_claim')
	   AND e.tlp IS DISTINCT FROM 'TLP:RED'
	   AND e.tlp IS DISTINCT FROM 'RED'
)`;

export const SQL = {
	total: `${CTE_REGIONAL}
SELECT count(*)::int AS total FROM regional`,
	departements: `${CTE_REGIONAL}
SELECT dept, count(*)::int AS incidents, count(DISTINCT org_id)::int AS orgs
  FROM regional GROUP BY dept ORDER BY incidents DESC, dept ASC`,
	secteurs: `${CTE_REGIONAL}
SELECT coalesce(nullif(btrim(sector), ''), nullif(btrim(kind), ''), 'non renseigné') AS secteur,
       count(*)::int AS incidents
  FROM regional GROUP BY 1 ORDER BY incidents DESC, secteur ASC`,
	sources: `${CTE_REGIONAL}
SELECT source_id, count(*)::int AS incidents
  FROM regional GROUP BY source_id ORDER BY incidents DESC, source_id ASC`,
	delai: `${CTE_REGIONAL}
SELECT percentile_cont(0.5) WITHIN GROUP (
         ORDER BY extract(epoch FROM (collected_at - observed_at)) / 3600.0
       ) AS heures,
       count(*)::int AS effectif
  FROM regional
 WHERE observed_at IS NOT NULL
   AND collected_at >= observed_at - interval '1 day'`,
	couverture: `${CTE_REGIONAL}, ${CTE_TOUT}
SELECT (SELECT count(*)::int FROM regional) AS rattaches,
       (SELECT count(*)::int FROM tout) AS total,
       round(100.0 * (SELECT count(*) FROM regional)
             / nullif((SELECT count(*) FROM tout), 0), 1) AS pourcent`,
	top: `${CTE_REGIONAL}
SELECT id::text AS id, title AS titre, coalesce(org_name, '—') AS organisation, dept,
       coalesce(nullif(btrim(sector), ''), nullif(btrim(kind), ''), 'non renseigné') AS secteur,
       to_char(coalesce(observed_at, collected_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
       family AS famille, severity AS severite, source_id, source_url
  FROM regional
 ORDER BY severity DESC NULLS LAST,
          coalesce(observed_at, collected_at) DESC NULLS LAST,
          id DESC
 LIMIT 10`,
	etat: `SELECT to_char(max(collected_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS derniere_collecte FROM event`,
};

type TotalRow = { total: number };
type DeptRow = { dept: string | null; incidents: number; orgs: number };
type SecteurRow = { secteur: string | null; incidents: number };
type SourceRow = { source_id: string; incidents: number };
type DelaiRow = { heures: number | null; effectif: number };
type CouvertureRow = { rattaches: number; total: number; pourcent: string | null };
type TopRow = Omit<IncidentLigne, "titre"> & { titre: string };
type EtatRow = { derniere_collecte: string | null };

/** Un libellé de département vient du référentiel, jamais d'une table inventée. */
export function libelleDept(dept: string | null): string {
	if (dept === null) return "non renseigné";
	return `${dept} — ${DEPT_LABELS[dept] ?? "hors Nouvelle-Aquitaine"}`;
}

function cellule(texte: string): string {
	return texte.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}


function pourcent(value: number | null): string {
	if (value === null) return "non mesuré";
	return `${value.toFixed(1).replace(".", ",")} %`;
}

function heures(value: number | null): string {
	if (value === null) return "non mesuré";
	return `${value.toFixed(1).replace(".", ",")} h`;
}

export function rendreRapportMensuel(donnees: DonneesRapportMensuel): string {
	const { mois } = donnees;
	const fenetre = fenetreMois(mois);
	const lignes: string[] = [];
	lignes.push(`# Rapport mensuel — Nouvelle-Aquitaine, ${mois}`);
	lignes.push("");
	lignes.push(
		`Période : ${fenetre.debut} → ${fenetre.fin} (UTC). Dernière collecte en base : ${donnees.derniereCollecte ?? "aucune"}.`,
	);
	lignes.push("");
	lignes.push("## Chiffres mesurés");
	lignes.push("");
	lignes.push("| Chiffre | Valeur | Méthode |");
	lignes.push("| --- | ---: | --- |");
	lignes.push(
		`| Incidents régionaux | ${donnees.incidents} | \`event\` joint \`org\` ; \`assertion_type\` revendication/incident confirmé, \`dept\` dans les 12 départements NA, TLP public, fenêtre ${fenetre.debut}–${fenetre.fin}. |`,
	);
	lignes.push(
		`| Départements touchés | ${donnees.departements.length} | \`count(DISTINCT dept)\` sur ce même jeu. |`,
	);
	lignes.push(
		`| Secteurs touchés | ${donnees.secteurs.length} | \`count(DISTINCT coalesce(secteur, kind))\` sur ce même jeu. |`,
	);
	lignes.push(
		`| Sources productives | ${donnees.sources.length} | \`count(DISTINCT source_id)\` sur ce même jeu. |`,
	);
	lignes.push(
		`| Délai médian | ${heures(donnees.delaiHeures)} | \`percentile_cont(0.5)\` de \`collected_at − observed_at\` sur ${donnees.delaiEffectif} incident(s) daté(s), écarts négatifs > 1 j exclus. |`,
	);
	lignes.push(
		`| Couverture de rattachement | ${pourcent(donnees.couverture.pourcent)} | ${donnees.couverture.rattaches} incidents rattachés à une org NA / ${donnees.couverture.total} revendications et incidents du mois, TLP public. |`,
	);
	lignes.push("");

	lignes.push("## Incidents par département");
	lignes.push("");
	lignes.push("| Département | Incidents | Organisations |");
	lignes.push("| --- | ---: | ---: |");
	if (donnees.departements.length === 0) lignes.push("| — | 0 | 0 |");
	for (const ligne of donnees.departements) {
		lignes.push(`| ${cellule(libelleDept(ligne.dept))} | ${ligne.incidents} | ${ligne.orgs} |`);
	}
	lignes.push("");

	lignes.push("## Incidents par secteur");
	lignes.push("");
	lignes.push("| Secteur | Incidents |");
	lignes.push("| --- | ---: |");
	if (donnees.secteurs.length === 0) lignes.push("| — | 0 |");
	for (const ligne of donnees.secteurs) {
		lignes.push(`| ${cellule(ligne.secteur)} | ${ligne.incidents} |`);
	}
	lignes.push("");

	lignes.push("## Sources productives");
	lignes.push("");
	lignes.push("| Source | Incidents |");
	lignes.push("| --- | ---: |");
	if (donnees.sources.length === 0) lignes.push("| — | 0 |");
	for (const ligne of donnees.sources) {
		lignes.push(`| \`${cellule(ligne.source_id)}\` | ${ligne.incidents} |`);
	}
	lignes.push("");

	lignes.push("## 10 incidents les plus significatifs");
	lignes.push("");
	lignes.push("Tri : sévérité décroissante, date de fait décroissante, identifiant décroissant. Le lien porte la source de chaque fait.");
	lignes.push("");
	lignes.push("| Date | Département | Organisation | Famille | Titre (source) |");
	lignes.push("| --- | --- | --- | --- | --- |");
	if (donnees.top.length === 0) lignes.push("| — | — | — | — | *Aucun incident régional ce mois-ci* |");
	for (const ligne of donnees.top) {
		const titre = cellule(ligne.titre);
		const lien = ligne.source_url ? `[${titre}](${ligne.source_url})` : titre;
		lignes.push(
			`| ${ligne.date} | ${cellule(libelleDept(ligne.dept))} | ${cellule(ligne.organisation)} | ${cellule(ligne.famille)} | ${lien} (\`${cellule(ligne.source_id)}\`) |`,
		);
	}
	lignes.push("");
	lignes.push(
		"_Tous les chiffres ci-dessus sont issus de requêtes sur la base du radar ; aucune valeur n'est estimée. La couverture de rattachement ne mesure pas les incidents absents de la collecte._",
	);
	lignes.push("");
	return lignes.join("\n");
}

/** Exécute les huit requêtes, puis rend le document. Aucune date murale. */
export async function genererRapportMensuel(mois: string, exec: ExecuteurSQL): Promise<DonneesRapportMensuel> {
	const { debut, fin } = fenetreMois(mois);
	const params = [debut, fin, DEPTS_NA];

	const [total, departements, secteurs, sources, delai, couverture, top, etat] = await Promise.all([
		exec<TotalRow>(SQL.total, params),
		exec<DeptRow>(SQL.departements, params),
		exec<SecteurRow>(SQL.secteurs, params),
		exec<SourceRow>(SQL.sources, params),
		exec<DelaiRow>(SQL.delai, params),
		exec<CouvertureRow>(SQL.couverture, params),
		exec<TopRow>(SQL.top, params),
		exec<EtatRow>(SQL.etat),
	]);

	return {
		mois,
		derniereCollecte: etat.rows[0]?.derniere_collecte ?? null,
		incidents: total.rows[0]?.total ?? 0,
		departements: departements.rows.map((ligne) => ({
			dept: ligne.dept ?? "non renseigné",
			incidents: ligne.incidents,
			orgs: ligne.orgs,
		})),
		secteurs: secteurs.rows.map((ligne) => ({
			secteur: ligne.secteur ?? "non renseigné",
			incidents: ligne.incidents,
		})),
		sources: sources.rows.map((ligne) => ({ source_id: ligne.source_id, incidents: ligne.incidents })),
		delaiHeures: delai.rows[0]?.heures ?? null,
		delaiEffectif: delai.rows[0]?.effectif ?? 0,
		couverture: {
			rattaches: couverture.rows[0]?.rattaches ?? 0,
			total: couverture.rows[0]?.total ?? 0,
			pourcent: couverture.rows[0]?.pourcent === null || couverture.rows[0]?.pourcent === undefined
				? null
				: Number(couverture.rows[0].pourcent),
		},
		top: top.rows.map((ligne) => ({
			id: ligne.id,
			titre: ligne.titre,
			organisation: ligne.organisation,
			dept: ligne.dept,
			secteur: ligne.secteur,
			date: ligne.date,
			famille: ligne.famille,
			severite: ligne.severite,
			source_id: ligne.source_id,
			source_url: ligne.source_url,
		})),
	};
}
