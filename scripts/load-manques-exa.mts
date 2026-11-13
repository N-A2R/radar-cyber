/**
 * Chargement des entités qualifiées par Exa, et mesure de l'effet sur la file.
 *
 * Le problème traité ici est la cause, pas le symptôme : le référentiel n'a
 * **aucun domaine** (0 sur 34 553 organisations), alors que les revendications
 * ransomware arrivent avec un domaine. Le matcher ne peut donc jamais
 * appliquer sa règle la plus forte (égalité de domaine, 0,95, promotion
 * automatique) et tout retombe dans la file de revue.
 *
 * Ce script charge les 302 entités déjà qualifiées — donc celles dont on
 * connaît le domaine canonique et, souvent, le SIREN — puis mesure combien de
 * faits en attente deviennent rattachables.
 *
 * Usage :
 *   tsx scripts/load-manques-exa.mts --dry-run
 *   tsx scripts/load-manques-exa.mts
 *   tsx scripts/load-manques-exa.mts --mesure       # ne charge rien, mesure
 *
 * Règles de chargement :
 *   - seulement `est_francaise = "present"` avec un SIREN à 9 chiffres ;
 *   - les entités marquées `desaccord: true` sont **exclues** : ce sont les
 *     homonymes où l'Ultra et le modèle par lots ne sont pas d'accord, un
 *     humain doit trancher ;
 *   - idempotent : rejouable sans doublon, par (entity_source, entity_code).
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { closePools, query } from "../apps/api/src/db.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const INPUT = `${ROOT}bench/results/exa-2026-11-13/exa-manques-final.json`;
const SOURCE = "exa-manques";

type Entite = {
	nomLisible: string;
	est_francaise: string;
	raison: string;
	domaine_canonique?: string | null;
	denomination_legale?: string | null;
	siren?: string | null;
	ville?: string | null;
	departement?: string | null;
	region?: string | null;
	type_organisation?: string | null;
	confiance?: string | null;
	desaccord?: boolean;
};

/** Un domaine, pas une URL : on retire schéma, `www.` et chemin. */
function cleanDomain(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const value = raw.trim().toLowerCase();
	if (!value) return null;
	const stripped = value
		.replace(/^https?:\/\//, "")
		.replace(/^www\./, "")
		.split(/[/?#]/)[0];
	return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(stripped) ? stripped : null;
}

function slugify(name: string, siren: string): string {
	const base = name
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 60);
	return `${base || "org"}-${siren}`;
}

const KIND: Record<string, string> = {
	entreprise: "entreprise",
	association: "entreprise",
	collectivite: "collectivite",
	etablissement_public: "operateur_critique",
	autre: "entreprise",
};

async function main(): Promise<void> {
	const dryRun = process.argv.includes("--dry-run");
	const mesureOnly = process.argv.includes("--mesure");
	const raw = JSON.parse(await readFile(INPUT, "utf8")) as { entites: Entite[] };
	const entites = raw.entites;

	const retenues = entites.filter(
		(e) => e.est_francaise === "present" && /^\d{9}$/.test(e.siren ?? "") && !e.desaccord,
	);
	const conflits = entites.filter((e) => e.desaccord);
	const sansSiren = entites.filter((e) => e.est_francaise === "present" && !/^\d{9}$/.test(e.siren ?? ""));

	console.log(`${entites.length} entités · ${retenues.length} chargeables · ${conflits.length} en désaccord · ${sansSiren.length} « present » sans SIREN`);

	if (!mesureOnly) {
		let inserted = 0;
		let updated = 0;
		let withDomain = 0;
		for (const e of retenues) {
			const domain = cleanDomain(e.domaine_canonique);
			if (domain) withDomain++;
			const name = (e.denomination_legale ?? e.nomLisible).trim().slice(0, 200);
			const kind = KIND[e.type_organisation ?? "entreprise"] ?? "entreprise";
			if (dryRun) continue;
			const r = await query<{ inserted: boolean }>(
				`INSERT INTO org (name, slug, kind, city, dept, domain, website, entity_code, entity_source, status)
				 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'confirme')
				 ON CONFLICT (entity_source, entity_code) WHERE entity_code IS NOT NULL AND entity_source IS NOT NULL
				 DO UPDATE SET
				   domain = COALESCE(org.domain, EXCLUDED.domain),
				   website = COALESCE(org.website, EXCLUDED.website),
				   city = COALESCE(org.city, EXCLUDED.city),
				   dept = COALESCE(org.dept, EXCLUDED.dept)
				 RETURNING (xmax = 0) AS inserted`,
				[name, slugify(name, e.siren as string), kind, e.ville ?? null, e.departement ?? null,
					domain, domain ? `https://${domain}` : null, e.siren, SOURCE],
			);
			if (r.rows[0]?.inserted) inserted++;
			else updated++;
		}
		console.log(
			dryRun
				? `dry-run : ${retenues.length} entités auraient été chargées, dont ${withDomain} avec un domaine`
				: `chargées : ${inserted} créées, ${updated} mises à jour, dont ${withDomain} avec un domaine`,
		);
	}

	// Mesure : combien de faits en attente sont désormais rattachables ?
	// Garde : sur une base non migrée (pas de colonne `kind`), la mesure n'a pas
	// de sens — on le dit au lieu de planter après avoir écrit.
	try {
	const [pending, withHint, domaineLike] = await Promise.all([
		query<{ n: string }>("SELECT count(*)::text AS n FROM quarantine_raw WHERE status='pending' AND promoted=false AND kind='claim'"),
		query<{ n: string }>("SELECT count(*)::text AS n FROM quarantine_raw WHERE status='pending' AND promoted=false AND kind='claim' AND org_hint IS NOT NULL"),
		query<{ n: string }>(
			`SELECT count(*)::text AS n FROM quarantine_raw
			  WHERE status='pending' AND promoted=false AND kind='claim'
			    AND org_hint ~ '^[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'`,
		),
	]);
	const [orgs, withDomainOrg] = await Promise.all([
		query<{ n: string }>("SELECT count(*)::text AS n FROM org"),
		query<{ n: string }>("SELECT count(*)::text AS n FROM org WHERE domain IS NOT NULL"),
	]);

	console.log(
		`faits en attente : ${pending.rows[0].n} · avec indice : ${withHint.rows[0].n} · indice = domaine : ${domaineLike.rows[0].n}`,
	);
	console.log(`référentiel : ${orgs.rows[0].n} organisations · ${withDomainOrg.rows[0].n} avec domaine`);
	} catch (error) {
		console.log(`mesure indisponible (schéma non migré ?) : ${String(error).slice(0, 120)}`);
	}

	// Rappel : les désaccords ne sont jamais chargés automatiquement.
	if (conflits.length) {
		console.log("désaccords laissés à l'arbitrage humain :");
		for (const c of conflits.slice(0, 25)) console.log(`  - ${c.nomLisible} (${c.domaine_canonique ?? "sans domaine"})`);
		if (conflits.length > 25) console.log(`  … ${conflits.length - 25} autres`);
	}
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(() => closePools());
