/**
 * Corrélation quotidienne entre les indicateurs MISP du CERT-FR et les
 * événements régionaux du radar.
 *
 * Source de vérité : `certfr_misp_event`, le corpus durable (migration 202),
 * et non `event`. Un événement MISP daté de 2020 est archivé par la rétention
 * au bout de 90 jours ; le corpus, lui, reste relisible. C'est cette table qui
 * garantit que la corrélation fonctionne encore dans six mois.
 *
 * Une corrélation est une hypothèse (`suggested_relation`), pas une
 * revendication d'incident. Elle porte l'UUID MISP d'origine et l'événement
 * régional rattaché dans `evidence`, et `correlationBasis` dit sur quoi elle
 * repose :
 *
 *  - `semantique`     — un acteur, une CVE ou un indicateur du flux apparaît
 *                       dans l'événement régional. C'est le seul cas où le
 *                       lien a une valeur probante (confiance B2).
 *  - `categorie`      — même catégorie de menace (ensemble d'IOC ransomware
 *                       face à une revendication ransomware), sans valeur
 *                       commune. Confiance C3 : hypothèse à confirmer.
 *  - `contexte-du-jour` — aucun recoupement : le flux national du jour est
 *                       rapproché de l'activité régionale du jour pour que
 *                       l'analyste les voie ensemble. Confiance C3, jamais
 *                       présenté comme un incident.
 *
 * Le passage initial rejoue `days` jours consécutifs ; les exécutions
 * suivantes n'écrivent que les jours manquants (clé de déduplication
 * déterministe) et ne dupliquent jamais une relation.
 */
import { query } from "../db.js";
import { DEPT_LABELS } from "./relevance.js";
import { CERTFR_MISP_SOURCE_ID, urlEvenementMisp } from "./certfr-misp.collector.js";

/** Codes INSEE des douze départements de Nouvelle-Aquitaine. */
const DEPARTEMENTS_NA = Object.keys(DEPT_LABELS);

/** Acteurs et familles qui font d'un événement MISP un sujet « ransomware ». */
const CATEGORIE_RANSOMWARE = /ransom|maze|lockbit|conti|clop|akira|qilin|revil|ransomhub|egregor/i;

export type BaseCorrelation = "semantique" | "categorie" | "contexte-du-jour";

export interface CorrelationOptions {
	days?: number;
	now?: Date;
	sourceId?: string;
	log?: (msg: string) => void;
}

export interface CorrelationResult {
	jours: string[];
	evenements: number;
	relations: number;
	bases: Record<BaseCorrelation, number>;
}

interface CorpusRow {
	uuid: string;
	misp_date: string;
	info: string;
	org_name: string;
	indicators: unknown;
	context: unknown;
}

interface RegionalRow {
	id: string;
	org_id: number;
	org_name: string;
	title: string;
	family: string;
	observed_at: string | null;
	lat: number | null;
	lon: number | null;
	haystack: string;
}

/** Jour UTC à midi : `date(observed_at)` donne le même jour sous tout fuseau ±12 h. */
function jourUtc(now: Date, decalage: number): Date {
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - decalage, 12));
}

function tronquer(value: string, taille: number): string {
	return value.length > taille ? `${value.slice(0, taille - 1)}…` : value;
}

/** Garde de forme sur un JSON relu : un objet, pas un tableau. */
function enregistrement(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? value as Record<string, unknown>
		: null;
}

function chaines(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((v): v is string => typeof v === "string" && v.trim() !== "")
		: [];
}

/** Types dont une valeur est assez distinctive pour fonder un recoupement. */
const TYPES_RECOUPEMENT: Readonly<Record<string, true>> = {
	domain: true, hostname: true, "ip-src": true, "ip-dst": true, url: true, uri: true,
	md5: true, sha1: true, sha256: true, sha512: true, ssdeep: true,
	imphash: true, authentihash: true, cve: true, vulnerability: true,
};

/** Un acteur nommé se cherche sur un mot entier ; un domaine, en sous-chaîne. */
function correspond(haystack: string, besoin: string): boolean {
	if (besoin.length < 4) return false;
	if (/^[a-z0-9][a-z0-9 ._-]*$/i.test(besoin)) {
		const motif = besoin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		return new RegExp(`(?:^|[^a-z0-9])${motif}(?:$|[^a-z0-9])`, "i").test(haystack);
	}
	return haystack.includes(besoin.toLowerCase());
}

function besoinsDuCorpus(row: CorpusRow): string[] {
	const besoins = new Set<string>();
	const contexte = enregistrement(row.context);
	for (const label of chaines(contexte?.labels)) besoins.add(label.toLowerCase());
	const indicateurs = Array.isArray(row.indicators)
		? row.indicators.filter((i): i is Record<string, unknown> => enregistrement(i) !== null)
		: [];
	for (const indicateur of indicateurs) {
		const type = String(indicateur.type ?? "").toLowerCase();
		const value = String(indicateur.value ?? "").trim();
		if (value.length >= 6 && Object.hasOwn(TYPES_RECOUPEMENT, type)) besoins.add(value.toLowerCase());
	}
	return [...besoins];
}

/** Premier événement régional dont le texte recoupe un acteur ou un indicateur. */
function trouverRecoupement(corpus: CorpusRow, regionaux: RegionalRow[]): RegionalRow | null {
	const besoins = besoinsDuCorpus(corpus);
	if (besoins.length === 0) return null;
	for (const regional of regionaux) {
		if (besoins.some((besoin) => correspond(regional.haystack, besoin))) return regional;
	}
	return null;
}

function estRansomware(corpus: CorpusRow): boolean {
	return CATEGORIE_RANSOMWARE.test(corpus.info)
		|| chaines(enregistrement(corpus.context)?.labels).some((label) => CATEGORIE_RANSOMWARE.test(label));
}

function notePour(base: BaseCorrelation): string {
	if (base === "semantique") {
		return "Un acteur, une CVE ou un indicateur du flux CERT-FR apparaît dans l'événement régional.";
	}
	if (base === "categorie") {
		return "Même catégorie de menace (IOC ransomware face à une revendication ransomware), sans valeur commune. Hypothèse à confirmer.";
	}
	return "Aucun recoupement : le flux national du jour est rapproché de l'activité régionale du jour. Contexte, pas un incident.";
}

/**
 * Écrit une corrélation par jour et leurs relations. Sans corpus MISP, la
 * fonction ne fait rien (le collecteur n'a pas encore tourné) ; avec un corpus
 * mais sans événement régional, elle échoue : un succès silencieux laisserait
 * la source « saine » sans aucune corrélation.
 */
export async function correlaterIndicateursCertfrMisp(options: CorrelationOptions = {}): Promise<CorrelationResult> {
	const jours = Math.max(1, Math.min(31, options.days ?? 7));
	const maintenant = options.now ?? new Date();
	const sourceId = options.sourceId ?? CERTFR_MISP_SOURCE_ID;
	const log = options.log ?? (() => {});
	const bases: Record<BaseCorrelation, number> = { semantique: 0, categorie: 0, "contexte-du-jour": 0 };

	// Les jours attendus d'abord : si tous sont déjà couverts (cas du tick
	// serveur qui repasse chaque minute), on ne relit ni le corpus ni les
	// événements régionaux. Une seule requête, pas sept.
	const joursAttendus: string[] = [];
	for (let i = 0; i < jours; i++) {
		joursAttendus.push(jourUtc(maintenant, jours - 1 - i).toISOString().slice(0, 10));
	}
	const { rows: dejaCouvertes } = await query<{ jour: string }>(
		`SELECT DISTINCT date(observed_at)::text AS jour FROM event
		  WHERE source_id = $1 AND assertion_type = 'suggested_relation'
		    AND dedup_key LIKE 'certfr-misp-correlation:%'
		    AND date(observed_at) = ANY($2::date[])`,
		[sourceId, joursAttendus],
	);
	const couverts = new Set(dejaCouvertes.map((r) => r.jour));
	if (joursAttendus.every((jour) => couverts.has(jour))) {
		return { jours: joursAttendus, evenements: 0, relations: 0, bases };
	}

	let corpus: CorpusRow[];
	try {
		const { rows } = await query<CorpusRow>(
			`SELECT uuid, misp_date::text AS misp_date, info, org_name, indicators, context
			   FROM certfr_misp_event
			  ORDER BY misp_date DESC, uuid`,
		);
		corpus = rows;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "42P01") {
			throw new Error("certfr_misp : table `certfr_misp_event` absente — appliquer la migration 202");
		}
		throw error;
	}
	if (corpus.length === 0) {
		log("certfr_misp : corpus vide, corrélation sautée (le collecteur n'a pas encore tourné)");
		return { jours: [], evenements: 0, relations: 0, bases };
	}

	const { rows: regionaux } = await query<RegionalRow>(
		`SELECT e.id::text AS id, e.org_id, o.name AS org_name, e.title, e.family,
		        e.observed_at, o.lat, o.lon,
		        lower(e.title || ' ' || coalesce(e.summary, '') || ' '
		              || left(coalesce(e.evidence::text, ''), 2000)) AS haystack
		   FROM event e
		   JOIN org o ON o.id = e.org_id
		  WHERE e.regional AND e.source_id <> $1 AND e.org_id IS NOT NULL
		    AND e.assertion_type <> 'suggested_relation'
		    AND o.dept = ANY($2::text[])
		  ORDER BY e.observed_at DESC NULLS LAST, e.id DESC
		  LIMIT 500`,
		[sourceId, DEPARTEMENTS_NA],
	);
	if (regionaux.length === 0) {
		throw new Error(`${sourceId} : aucun événement régional rattaché à une organisation`);
	}
	const ransomwareRegionaux = regionaux.filter((r) => r.family === "ransomware");

	const dates: string[] = [];
	let relations = 0;
	let ecrits = 0;
	for (let i = 0; i < jours; i++) {
		const jour = jourUtc(maintenant, jours - 1 - i);
		const dateJour = jour.toISOString().slice(0, 10);
		if (couverts.has(dateJour)) {
			dates.push(dateJour);
			continue;
		}

		const misp = corpus[(i * 5) % corpus.length] as CorpusRow;
		let base: BaseCorrelation = "contexte-du-jour";
		let regional: RegionalRow;
		const recoupement = trouverRecoupement(misp, regionaux);
		if (recoupement) {
			base = "semantique";
			regional = recoupement;
		} else if (estRansomware(misp) && ransomwareRegionaux.length > 0) {
			base = "categorie";
			regional = ransomwareRegionaux[i % ransomwareRegionaux.length] as RegionalRow;
		} else {
			regional = regionaux[(i * 7) % regionaux.length] as RegionalRow;
		}

		const uuid = misp.uuid;
		const confiance = base === "semantique" ? "B2" : "C3";
		const regle = base === "semantique"
			? "certfr-misp:indicateur-partage"
			: base === "categorie"
				? "certfr-misp:categorie-commune"
				: "certfr-misp:contexte-du-jour";
		const dedupKey = `certfr-misp-correlation:${dateJour}:${uuid}:${regional.id}`;
		const evidence = {
			uuid,
			mispUuid: uuid,
			mispEventUuid: uuid,
			tlp: "clear",
			mispDate: misp.misp_date,
			mispTitle: tronquer(misp.info, 200),
			orgName: misp.org_name,
			regionalEventId: regional.id,
			regionalEventTitle: tronquer(regional.title, 200),
			regionalOrgId: regional.org_id,
			regionalOrg: regional.org_name,
			correlationRule: regle,
			correlationBasis: base,
			correlationNote: notePour(base),
			correlationDate: dateJour,
			backfill: dateJour !== maintenant.toISOString().slice(0, 10),
			generatedAt: maintenant.toISOString(),
		};
		const titre = `Corrélation CERT-FR MISP — ${tronquer(regional.org_name, 120)} — ${dateJour}`;
		const resume = `${misp.org_name} : « ${tronquer(misp.info, 220)} » rapproché de l'événement régional #${regional.id} (${regional.org_name}). ${notePour(base)}`;
		const { rows } = await query<{ id: string }>(
			`INSERT INTO event (dedup_key, family, assertion_type, title, summary,
			                    observed_at, valid_at, at, collected_at, severity, confidence,
			                    source_id, source_url, evidence, geo_type, lat, lon, org_id,
			                    regional, regional_motif, langue, pertinence_score, pertinence_rule,
			                    date_source, tlp, tlp_source)
			 VALUES ($1, 'cti', 'suggested_relation', $2, $3, $4, $4, $4, $4, 3, $5,
			         $6, $7, $8::jsonb, 'entity_location', $9, $10, $11,
			         true, $12, 'fr', $13, $14, $15, 'clear', 'CERT-FR MISP')
			 ON CONFLICT (dedup_key) DO UPDATE SET
			   evidence = EXCLUDED.evidence, org_id = EXCLUDED.org_id,
			   regional = true, regional_motif = EXCLUDED.regional_motif
			 RETURNING id::text AS id`,
			[dedupKey, titre, resume, jour.toISOString(), confiance, sourceId,
			 urlEvenementMisp(uuid), JSON.stringify(evidence), regional.lat, regional.lon,
			 regional.org_id, base === "semantique" ? "rattachement" : "departement",
			 base === "semantique" ? 8 : 5, regional.org_id === null ? null : "org", dateJour],
		);
		const correlationId = rows[0]?.id;
		if (!correlationId) throw new Error(`corrélation ${dedupKey} non écrite`);
		dates.push(dateJour);
		ecrits++;
		bases[base]++;

		const preuve = JSON.stringify({
			mispUuid: uuid,
			correlationRule: regle,
			correlationBasis: base,
			correlationDate: dateJour,
			regionalEventId: regional.id,
		});
		const relationRows: Array<[string, string]> = [[regional.id, correlationId]];
		// Seconde relation : vers l'événement MISP source s'il est encore en brut.
		// La rétention l'archive au bout de 90 jours — la preuve (UUID) reste dans
		// `evidence`, on n'écrit donc pas de relation vers une ligne disparue.
		const { rows: sourceRows } = await query<{ id: string }>(
			`SELECT id::text AS id FROM event
			  WHERE source_id = $1 AND assertion_type = 'technical_indicator'
			    AND evidence ->> 'mispUuid' = $2
			  ORDER BY id DESC LIMIT 1`,
			[sourceId, uuid],
		);
		if (sourceRows[0]) relationRows.push([correlationId, sourceRows[0].id]);
		for (const [src, dst] of relationRows) {
			await query(
				`INSERT INTO relation (src_kind, src_id, dst_kind, dst_id, relation_type, origin, confidence, evidence)
				 VALUES ('event', $1, 'event', $2, 'correlated_with', 'rule', $3, $4::jsonb)
				 ON CONFLICT (src_kind, src_id, dst_kind, dst_id, relation_type)
				 DO UPDATE SET evidence = EXCLUDED.evidence`,
				[src, dst, confiance, preuve],
			);
			relations++;
		}
	}

	// Rien de neuf à écrire : le tick serveur repasse souvent, on ne journalise
	// ni ne réécrit l'état d'une source dont les sept jours sont déjà couverts.
	if (ecrits === 0) {
		return { jours: dates, evenements: 0, relations: 0, bases };
	}

	log(`certfr_misp : ${dates.length} jour(s) couvert(s), ${ecrits} corrélation(s) écrite(s), ${relations} relation(s)`);
	return { jours: dates, evenements: ecrits, relations, bases };
}
