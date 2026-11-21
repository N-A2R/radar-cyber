/**
 * Rejeu d'une période : event_archive → event, avec le moteur courant.
 *
 * L'archive ne garde pas les textes : elle garde le nom de l'organisation tel
 * qu'il était à la purge. C'est ce nom qui est représenté au moteur courant —
 * jamais une reconstruction inventée du titre ou du résumé perdus. Le diff est
 * donc « organisation archivée → organisation que le moteur choisit aujourd'hui
 * pour ce même nom », ligne par ligne, avec le motif et l'alias retenus.
 *
 *   tsx scripts/rejeu-periode.mts --depuis=2024-01-01 --jusqu-a=2025-01-01
 *   tsx scripts/rejeu-periode.mts --depuis=2024-01-01 --jusqu-a=2025-01-01 --dry-run
 *   tsx scripts/rejeu-periode.mts --depuis=2024-01-01 --jusqu-a=2025-01-01 --mesurer-idempotence
 *
 * La période porte sur `valid_at` (quand le fait était vrai), avec repli sur
 * `observed_at` puis `collected_at` pour les archives antérieures à la
 * migration 049. C'est la même horloge que `/api/history`. L'écriture est une
 * projection : INSERT ... ON CONFLICT DO NOTHING pour les événements disparus
 * du brut, UPDATE de org_id seulement pour ceux qui sont revenus, et un fait
 * de journal pour toute décision nouvelle. Relancer la même période ne réécrit
 * rien : c'est la mesure d'idempotence.
 */
import { createHash } from "node:crypto";
import { closePools, query, withTransaction } from "../apps/api/src/db.js";
import { gazetteerCharge, preparerGazetteer } from "../apps/api/src/collectors/relevance.js";
import { designateUneOrganisation } from "../apps/api/src/match/gazetteer.js";
import { consignerLotAvec, MOTEURS, type JournalEntry } from "../apps/api/src/journal/index.js";

type Arguments = {
	depuis: string | null;
	jusquA: string | null;
	dryRun: boolean;
	mesurer: boolean;
	afficher: number;
};

function lireArguments(argv: string[]): Arguments {
	const option = (nom: string): string | null => argv.find((a) => a.startsWith(`--${nom}=`))?.split("=")[1] ?? null;
	// `--jusqua` est accepté pour rester compatible avec rejouer-moteur.mts.
	const jusquA = option("jusqu-a") ?? option("jusqua");
	const depuis = option("depuis");
	for (const [nom, valeur] of [["--depuis", depuis], ["--jusqu-a", jusquA]] as const) {
		if (valeur !== null && (!/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(valeur) || Number.isNaN(Date.parse(valeur)))) {
			throw new Error(`${nom} invalide : ${valeur} (attendu YYYY-MM-DD ou ISO)`);
		}
	}
	if (depuis !== null && jusquA !== null && Date.parse(depuis) >= Date.parse(jusquA)) {
		throw new Error(`période vide ou inversée : --depuis=${depuis} doit précéder --jusqu-a=${jusquA}`);
	}
	if (depuis === null && jusquA === null) {
		throw new Error("une période est obligatoire : --depuis=… et/ou --jusqu-a=…");
	}
	const afficher = Number(option("afficher") ?? "0");
	return {
		depuis,
		jusquA,
		dryRun: argv.includes("--dry-run"),
		mesurer: argv.includes("--mesurer-idempotence"),
		afficher: Number.isFinite(afficher) && afficher >= 0 ? afficher : 0,
	};
}

type ArchiveLigne = {
	dedup_key: string;
	family: string;
	assertion_type: string;
	org_archive_id: number | null;
	org_archive_nom: string | null;
	source_id: string;
	source_url: string | null;
	severity: number;
	confidence: string | null;
	admission_rule: string | null;
	observed_at: Date | null;
	collected_at: Date;
	valid_at: Date | null;
	at: Date;
};
type Decision = {
	ligne: ArchiveLigne;
	orgId: number | null;
	orgNom: string | null;
	motif: string;
	alias: string | null;
	confiance: number;
};

type Changement = {
	dedup_key: string;
	date: string;
	avantId: number | null;
	avantNom: string | null;
	apresId: number | null;
	apresNom: string | null;
	nature: "nouveau" | "perdu" | "modifie";
	motif: string;
	alias: string | null;
};

type Resultat = {
	lignes: string[];
	diffSha: string;
	projectionSha: string;
	insertions: number;
	misAJour: number;
	journalises: number;
	lacunes: number;
	changements: number;
};

const iso = (valeur: Date | string | null): string | null => {
	if (valeur === null) return null;
	const date = valeur instanceof Date ? valeur : new Date(valeur);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

/** Empreinte courte d'un contenu canonique : comparable d'une exécution à l'autre. */
function empreinte(valeur: unknown): string {
	return createHash("sha256").update(JSON.stringify(valeur)).digest("hex").slice(0, 16);
}

function periodeSql(args: Arguments): { where: string; params: unknown[] } {
	const conditions: string[] = [];
	const params: unknown[] = [];
	if (args.depuis !== null) {
		params.push(args.depuis);
		conditions.push(`COALESCE(a.valid_at, a.observed_at, a.collected_at) >= $${params.length}::timestamptz`);
	}
	if (args.jusquA !== null) {
		params.push(args.jusquA);
		conditions.push(`COALESCE(a.valid_at, a.observed_at, a.collected_at) < $${params.length}::timestamptz`);
	}
	return { where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", params };
}

async function lireArchives(args: Arguments): Promise<ArchiveLigne[]> {
	const { where, params } = periodeSql(args);
	const { rows } = await query<ArchiveLigne>(
		`SELECT a.dedup_key, a.family, a.assertion_type,
		        a.org_id AS org_archive_id,
		        COALESCE(a.org_name, oa.name) AS org_archive_nom,
		        a.source_id, a.source_url, a.severity, a.confidence, a.admission_rule,
		        a.observed_at, a.collected_at, a.valid_at, a.at
		   FROM event_archive a
		   LEFT JOIN org oa ON oa.id = a.org_id
		   ${where}
		  ORDER BY a.dedup_key`,
		params,
	);
	return rows;
}

/** Le moteur courant, exactement sur le chemin qu'utilise l'ingestion. */
async function decider(lignes: ArchiveLigne[]): Promise<Decision[]> {
	if (lignes.length === 0) return [];
	const tailleIndex = await preparerGazetteer();
	const gaz = gazetteerCharge();
	if (!gaz) throw new Error("gazetteer indisponible : rejeu refusé plutôt que de tout détacher");
	console.log(`Gazetteer : ${tailleIndex} alias indexés, ${gaz.orgsById.size} organisations (${MOTEURS.rattachement})`);
	return lignes.map((ligne) => {
		const texte = (ligne.org_archive_nom ?? "").trim();
		const verdict = texte === "" ? null : designateUneOrganisation(gaz, texte);
		const orgId = verdict?.org?.id ?? null;
		return {
			ligne,
			orgId,
			orgNom: orgId === null ? null : gaz.orgsById.get(orgId)?.name ?? null,
			motif: verdict?.reason ?? "aucun",
			alias: verdict?.alias ?? null,
			confiance: verdict?.confidence ?? 0,
		};
	});
}

async function derniersRattachements(cles: string[]): Promise<Map<string, number | null>> {
	if (cles.length === 0) return new Map();
	const { rows } = await query<{ subject: string; org_id: string | null }>(
		`WITH dernier AS (
		   SELECT DISTINCT ON (subject) subject, payload
		     FROM journal
		    WHERE subject = ANY($1::text[])
		      AND kind IN ('event.rattachement', 'match.decided')
		    ORDER BY subject, recorded_at DESC, id DESC
		 )
		 SELECT subject, payload->>'orgId' AS org_id FROM dernier`,
		[cles],
	);
	return new Map(rows.map((r) => [r.subject, r.org_id === null ? null : Number.parseInt(r.org_id, 10)]));
}

async function empreinteProjection(args: Arguments): Promise<string> {
	const { where, params } = periodeSql(args);
	const { rows } = await query<{ dedup_key: string; org_id: number | null }>(
		`SELECT a.dedup_key, e.org_id
		   FROM event_archive a
		   JOIN event e ON e.dedup_key = a.dedup_key
		   ${where}
		  ORDER BY a.dedup_key`,
		params,
	);
	return empreinte(rows.map((r) => [r.dedup_key, r.org_id]));
}

function colonnes(decisions: Decision[]): {
	cles: string[]; orgIds: (number | null)[]; familles: string[]; types: string[]; titres: string[];
	observes: (string | null)[]; collectes: string[]; severites: number[]; confidences: (string | null)[];
	sources: string[]; urls: (string | null)[]; admissions: (string | null)[]; avantIds: (number | null)[];
	avantNoms: (string | null)[]; valides: (string | null)[]; su: string[];
} {
	return {
		cles: decisions.map((d) => d.ligne.dedup_key),
		orgIds: decisions.map((d) => d.orgId),
		familles: decisions.map((d) => d.ligne.family),
		types: decisions.map((d) => d.ligne.assertion_type),
		titres: decisions.map((d) => (d.ligne.org_archive_nom ?? d.ligne.dedup_key).slice(0, 500)),
		observes: decisions.map((d) => iso(d.ligne.observed_at)),
		collectes: decisions.map((d) => iso(d.ligne.collected_at) ?? new Date(0).toISOString()),
		severites: decisions.map((d) => d.ligne.severity),
		confidences: decisions.map((d) => d.ligne.confidence),
		sources: decisions.map((d) => d.ligne.source_id),
		urls: decisions.map((d) => d.ligne.source_url),
		admissions: decisions.map((d) => d.ligne.admission_rule),
		avantIds: decisions.map((d) => d.ligne.org_archive_id),
		avantNoms: decisions.map((d) => d.ligne.org_archive_nom),
		valides: decisions.map((d) => iso(d.ligne.valid_at)),
		su: decisions.map((d) => iso(d.ligne.at) ?? iso(d.ligne.collected_at) ?? new Date(0).toISOString()),
	};
}

async function ecrire(decisions: Decision[], journaux: JournalEntry[]): Promise<{ insertes: number; misAJour: number; journalises: number; lacunes: number }> {
	if (decisions.length === 0) return { insertes: 0, misAJour: 0, journalises: 0, lacunes: 0 };
	const c = colonnes(decisions);
	return withTransaction(async (client) => {
		// Les événements purgés n'existent plus dans `event` : on recrée une
		// projection minimale, les champs absents de l'archive restent à leur
		// défaut. La preuve de provenance est dans `evidence`, pas dans le titre.
		const insert = await client.query(
			`INSERT INTO event
			   (dedup_key, family, assertion_type, title, observed_at, collected_at, valid_at, at,
			    severity, confidence, source_id, source_url, admission_rule, evidence, org_id)
			 SELECT d.cle, d.famille, d.type, d.titre, d.observe::timestamptz, d.collecte::timestamptz,
			        COALESCE(d.valide, d.observe)::timestamptz, d.su::timestamptz,
			        d.severite, d.confiance, d.source, d.url, d.admission,
			        jsonb_build_object('rejeu', 'event_archive', 'orgArchiveId', d.avant_id,
			                           'orgArchiveNom', d.avant_nom),
			        d.org_id
			   FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::timestamptz[],
			               $6::timestamptz[], $7::smallint[], $8::text[], $9::text[], $10::text[],
			               $11::text[], $12::int[], $13::text[], $14::text[],
			               $15::timestamptz[], $16::timestamptz[])
			        AS d(cle, famille, type, titre, observe, collecte, severite, confiance,
			             source, url, admission, org_id, avant_id, avant_nom, valide, su)
			   ON CONFLICT (dedup_key) DO NOTHING`,
			[c.cles, c.familles, c.types, c.titres, c.observes, c.collectes, c.severites,
				c.confidences, c.sources, c.urls, c.admissions, c.orgIds, c.avantIds, c.avantNoms,
				c.valides, c.su],
		);
		// Un événement encore présent au brut garde son texte : seul le
		// rattachement est rejoué, jamais les champs que l'archive n'a pas.
		const update = await client.query(
			`UPDATE event e SET org_id = d.org_id
			   FROM unnest($1::text[], $2::int[]) AS d(cle, org_id)
			  WHERE e.dedup_key = d.cle
			    AND e.org_id IS DISTINCT FROM d.org_id`,
			[c.cles, c.orgIds],
		);
		const lot = await consignerLotAvec(
			(sql, params) => client.query(sql, params ? [...params] : undefined),
			journaux,
		);
		if (lot.erreurs.length > 0) throw new Error(`journal : ${lot.erreurs.join(" ; ")}`);
		return {
			insertes: insert.rowCount ?? 0,
			misAJour: update.rowCount ?? 0,
			journalises: lot.consignes - lot.lacunes,
			lacunes: lot.lacunes,
		};
	});
}

async function rejouer(args: Arguments, afficher: boolean): Promise<Resultat> {
	const lignes = await lireArchives(args);
	const decisions = await decider(lignes);
	const changements: Changement[] = [];
	for (const d of decisions) {
		const avantId = d.ligne.org_archive_id;
		if (avantId === d.orgId) continue;
		changements.push({
			dedup_key: d.ligne.dedup_key,
			date: (iso(d.ligne.valid_at) ?? iso(d.ligne.observed_at) ?? iso(d.ligne.collected_at) ?? "").slice(0, 10),
			avantId,
			avantNom: d.ligne.org_archive_nom,
			apresId: d.orgId,
			apresNom: d.orgNom,
			nature: avantId === null ? "nouveau" : d.orgId === null ? "perdu" : "modifie",
			motif: d.motif,
			alias: d.alias,
		});
	}
	const parNature = (nature: Changement["nature"]): number => changements.filter((c) => c.nature === nature).length;
	const diffSha = empreinte(changements);

	const derniers = await derniersRattachements(decisions.map((d) => d.ligne.dedup_key));
	const journaux: JournalEntry[] = [];
	for (const d of decisions) {
		const dernier = derniers.get(d.ligne.dedup_key);
		if (dernier === d.orgId) continue;
		const avant = d.ligne.org_archive_nom ?? String(d.ligne.org_archive_id ?? "aucune");
		const apres = d.orgNom ?? (d.orgId === null ? "aucune" : String(d.orgId));
		journaux.push({
			kind: "event.rattachement",
			subject: d.ligne.dedup_key,
			summary: `rejeu ${MOTEURS.rattachement} : ${avant} → ${apres}`,
			actor: `moteur:${MOTEURS.rattachement}:rejeu`,
			validAt: d.ligne.valid_at ?? d.ligne.observed_at ?? d.ligne.collected_at,
			payload: {
				orgId: d.orgId,
				moteur: MOTEURS.rattachement,
				motif: d.motif,
				alias: d.alias,
				confiance: d.confiance,
				orgArchiveId: d.ligne.org_archive_id,
				orgArchiveNom: d.ligne.org_archive_nom,
				origine: "event_archive",
			},
		});
	}

	const sortie: string[] = [];
	sortie.push(`Archives lues : ${lignes.length} (${lignes.filter((l) => l.org_archive_id !== null).length} avec organisation archivée)`);
	if (lignes.length === 0) sortie.push("Aucune archive sur la période : aucun rattachement à rejouer.");
	sortie.push(`Rattachements : ${decisions.length - changements.length} identiques, ${changements.length} changés ` +
		`(${parNature("nouveau")} nouveaux, ${parNature("perdu")} perdus, ${parNature("modifie")} modifiés)`);
	sortie.push(`Empreinte du diff (sha256/16) : ${diffSha}`);
	if (afficher) {
		sortie.push("Diff nominatif des rattachements changés :");
		const visibles = args.afficher === 0 ? changements : changements.slice(0, args.afficher);
		for (const c of visibles) {
			const avant = `${c.avantNom ?? "aucune"} (#${c.avantId ?? "null"})`;
			const apres = `${c.apresNom ?? "aucune"} (#${c.apresId ?? "null"})`;
			sortie.push(`  ${c.date} ${c.dedup_key} | ${avant} → ${apres} | ${c.nature} ${c.motif} alias=${c.alias ?? "-"}`);
		}
		if (visibles.length < changements.length) sortie.push(`  … ${changements.length - visibles.length} autre(s)`);
	}

	if (args.dryRun) {
		sortie.push(`Dry-run : ${journaux.length} fait(s) à consigner, aucune écriture.`);
		if (afficher) sortie.forEach((l) => console.log(l));
		return { lignes: sortie, diffSha, projectionSha: "", insertions: 0, misAJour: 0, journalises: 0, lacunes: 0, changements: changements.length };
	}

	const ecritures = await ecrire(decisions, journaux);
	const projectionSha = await empreinteProjection(args);
	sortie.push(`Écritures : ${ecritures.insertes} inséré(s), ${ecritures.misAJour} mis à jour, ` +
		`${ecritures.journalises} fait(s) journalisé(s), ${ecritures.lacunes} lacune(s)`);
	sortie.push(`Empreinte de la projection (sha256/16) : ${projectionSha}`);
	if (afficher) sortie.forEach((l) => console.log(l));
	return {
		lignes: sortie,
		diffSha,
		projectionSha,
		insertions: ecritures.insertes,
		misAJour: ecritures.misAJour,
		journalises: ecritures.journalises,
		lacunes: ecritures.lacunes,
		changements: changements.length,
	};
}

async function main(): Promise<void> {
	const args = lireArguments(process.argv.slice(2));
	const periode = `[${args.depuis ?? "−∞"}, ${args.jusquA ?? "+∞"})`;
	console.log(`Rejeu event_archive → event — période ${periode}`);
	console.log(`Horloge : COALESCE(valid_at, observed_at, collected_at) ; texte représenté au moteur : org_name archivé`);

	const premier = await rejouer(args, true);
	if (!args.mesurer) return;
	console.log("\nMesure d'idempotence : second rejeu de la même période");
	const second = await rejouer(args, false);
	second.lignes.forEach((l) => console.log(`  ${l}`));
	const identique = premier.diffSha === second.diffSha
		&& premier.projectionSha === second.projectionSha
		&& second.insertions === 0
		&& second.misAJour === 0
		&& second.journalises === 0;
	console.log(`  diff ${premier.diffSha === second.diffSha ? "identique" : "DIFFÉRENT"}, ` +
		`projection ${premier.projectionSha === second.projectionSha ? "identique" : "DIFFÉRENTE"}, ` +
		`seconde passe ${second.insertions + second.misAJour + second.journalises} écriture(s)`);
	console.log(`IDEMPOTENT : ${identique ? "oui" : "non"}`);
	if (!identique) process.exitCode = 1;
}

main()
	.catch((error: unknown) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await closePools().catch(() => {});
	});
