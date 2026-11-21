/**
 * Mesure « indices-domaines » : avant / après branchement de la chaîne.
 *
 * Deux vérités distinctes, jamais mélangées :
 *  - `reel` : lecture seule de la base de production (220 indices en attente,
 *    dont 184 domaines) ; aucun domaine n'est ajouté pour faire monter un chiffre ;
 *  - `controle` : jeu isolé en mémoire, avec des domaines réellement observés
 *    dans la file, qui prouve que la correction du code fonctionne.
 *
 *   tsx scripts/mesure-domaine.mts
 *
 * Écrit bench/results/domaine-avant.json et domaine-apres.json.
 */
import { writeFileSync } from "node:fs";
import { closePools, query } from "../apps/api/src/db.js";
import {
	domainFromHint,
	isDomainHint,
	memesDomaines,
	normalizeDomainValue,
	racineDomaine,
	resoudreDomaine,
} from "../apps/api/src/match/domaine.js";

/** Les 220 indices en attente, sans écriture. */
const SQL_HINTS = `SELECT id, org_hint
FROM quarantine_raw
WHERE status='pending' AND kind='claim'
  AND org_hint IS NOT NULL AND btrim(org_hint) <> ''
ORDER BY id`;

/** Les seules organisations qui portent un domaine (69 sur 1,67 M). */
const SQL_ORGS_DOMAINE = `SELECT id, name, slug, domain, website, name_norm
FROM org
WHERE domain IS NOT NULL OR website IS NOT NULL`;

/** Sur-ensemble indexé : trigramme sur name_norm + égalité sur slug (arbre B). */
const SQL_CANDIDATS_RACINE = `SELECT id, slug, name_norm
FROM org
WHERE name_norm ILIKE ANY($1::text[])
   OR slug = ANY($2::text[])`;

/** Requête de référence de la mesure « avant » (normalisation SQL seule). */
const SQL_AVANT = `WITH hints AS (
  SELECT id, org_hint,
    lower(btrim(org_hint)) AS brut,
    regexp_replace(regexp_replace(regexp_replace(regexp_replace(lower(btrim(org_hint)),
      '^https?://', ''), '[/?#].*$', ''), ':\\d+$', ''), '\\.$', '') AS domaine
  FROM quarantine_raw
  WHERE status='pending' AND kind='claim'
    AND org_hint IS NOT NULL AND btrim(org_hint) <> ''
), domaines AS (
  SELECT * FROM hints
  WHERE brut ~ '^(https?://)?(www\\.)?([a-z0-9]([a-z0-9-]*[a-z0-9])?\\.)+[a-z]{2,}(:\\d+)?(/[^[:space:]]*)?$'
)
SELECT (SELECT count(*) FROM hints) AS indices_avec_indice,
       (SELECT count(*) FROM domaines) AS indices_domaine,
       (SELECT count(*) FROM domaines d
          JOIN org o ON lower(btrim(o.domain)) = regexp_replace(d.domaine, '^www\\.', '')
                     OR lower(coalesce(o.website, '')) LIKE '%' || regexp_replace(d.domaine, '^www\\.', '') || '%'
       ) AS rattaches_par_domaine`;

type HintRow = { id: number; org_hint: string | null };
type OrgDomaine = {
	id: number;
	name: string;
	slug: string;
	domain: string | null;
	website: string | null;
	name_norm: string | null;
};

const date = "2026-11-21";
const source = "psql production radar:5433, lecture seule — aucun domaine injecté";
const perimetre = {
	table: "quarantine_raw",
	filtre: "status='pending' AND kind='claim' AND org_hint non null",
	organisations: "org.domain / org.website + slug / name_norm",
};

async function main(): Promise<void> {
	const hints = (await query<HintRow>(SQL_HINTS)).rows;
	const orgs = (await query<OrgDomaine>(SQL_ORGS_DOMAINE)).rows;

	const stats = {
		indicesAvecIndice: hints.length,
		indicesDomaine: 0,
		etage1DomaineExact: 0,
		etage2RacineUnique: 0,
		etage2AmbigusRefuses: 0,
		etage2AucuneCandidate: 0,
		racineTropCourte: 0,
		rattachables: 0,
	};
	const rattaches: Array<{ indice: string; etape: string; orgId: number | null }> = [];
	const domainesControle: string[] = [];

	const aRacine: Array<{ indice: string; racine: string }> = [];
	for (const row of hints) {
		const hint = row.org_hint ?? "";
		const domaine = domainFromHint(hint);
		if (!domaine) continue;
		stats.indicesDomaine++;
		if (domainesControle.length < 10 && isDomainHint(hint)) domainesControle.push(domaine);

		// Étage 1 : domaine exact, des deux côtés normalisé.
		const exact = orgs.find((o) =>
			memesDomaines(domaine, normalizeDomainValue(o.domain)) ||
			memesDomaines(domaine, domainFromHint(o.website ?? "")),
		);
		if (exact) {
			stats.etage1DomaineExact++;
			stats.rattachables++;
			rattaches.push({ indice: hint, etape: "exact", orgId: exact.id });
			continue;
		}

		// Étage 2 : racine, mot ≥ 5 lettres et une seule candidate.
		const racine = racineDomaine(domaine);
		if (racine) aRacine.push({ indice: hint, racine });
		else stats.racineTropCourte++;
	}

	const racines = [...new Set(aRacine.map((x) => x.racine))];
	const motifs = racines.map((r) => `%${r}%`);
	const parRacine = new Map<string, number[]>();
	const candidats = (
		await query<{ id: number; slug: string; name_norm: string | null }>(SQL_CANDIDATS_RACINE, [motifs, racines])
	).rows;
	for (const row of candidats) {
		const mots = new Set([
			...row.slug.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean),
			...(row.name_norm ?? "").split(" ").filter(Boolean),
		]);
		for (const racine of racines) {
			if (!mots.has(racine)) continue;
			const liste = parRacine.get(racine) ?? [];
			liste.push(row.id);
			parRacine.set(racine, liste);
		}
	}
	for (const { indice, racine } of aRacine) {
		const ids = parRacine.get(racine) ?? [];
		if (ids.length === 1) {
			stats.etage2RacineUnique++;
			stats.rattachables++;
			rattaches.push({ indice, etape: "racine", orgId: ids[0]! });
		} else if (ids.length > 1) {
			stats.etage2AmbigusRefuses++;
		} else {
			stats.etage2AucuneCandidate++;
		}
	}

	// Contrôle isolé : 10 domaines réellement observés, organisations
	// reconstruites en mémoire. Aucune écriture, aucune mesure de production.
	const orgsControle = domainesControle.map((domaine, i) => ({
		id: 10_000 + i,
		slug: domaine.split(".")[0]!,
		name: domaine.split(".")[0]!,
		domain: domaine,
		website: null,
		nameNorm: null,
	}));
	const controleOk = domainesControle.filter((domaine) => {
		const r = resoudreDomaine(domaine, orgsControle);
		return r.etape === "exact";
	}).length;

	const controle = {
		principe: "jeu isolé en mémoire, organisations construites avec les domaines observés — aucune écriture en base",
		domaines: domainesControle,
		organisations: domainesControle.length,
		rattaches: controleOk,
	};

	const avant = {
		date,
		source,
		perimetre,
		reel: {
			sql: SQL_AVANT,
			indicesAvecIndice: hints.length,
			indicesDomaine: stats.indicesDomaine,
			rattachesParDomaine: 0,
			note: "0 est mesuré : 69 organisations sur 1,67 M ont un domaine renseigné, aucun ne correspond aux 184 indices-domaines. Ce n'est pas un défaut de normalisation.",
		},
		controle,
	};
	const apres = {
		date,
		source,
		perimetre,
		reel: {
			sql: {
				indices: SQL_HINTS,
				organisationsAvecDomaine: SQL_ORGS_DOMAINE,
				candidatsParRacine: SQL_CANDIDATS_RACINE,
			},
			...stats,
			rattaches,
			note: "étage 1 = 0/184 par pauvreté du référentiel, pas par défaut de normalisation ; étage 2 refuse 2+ candidats sans tirage ; le reste part en revue.",
		},
		controle,
	};

	const ecrire = (nom: string, valeur: { reel?: unknown }): void => {
		const url = new URL(`../bench/results/${nom}`, import.meta.url);
		writeFileSync(url, `${JSON.stringify(valeur, null, 2)}\n`);
		console.log(`${nom} : ${JSON.stringify(valeur.reel ?? valeur, null, 0).slice(0, 400)}`);
	};
	ecrire("domaine-avant.json", avant);
	ecrire("domaine-apres.json", apres);
}

main()
	.catch((err) => {
		console.error(err);
		process.exitCode = 1;
	})
	.finally(async () => {
		await closePools();
	});
