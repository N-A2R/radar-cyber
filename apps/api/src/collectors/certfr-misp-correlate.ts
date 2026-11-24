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
 *  - `contexte-du-jour` — aucun recoupement temporel et thématique : le jour
 *                       est journalisé, sans événement ni relation. Un simple
 *                       voisinage de dates n'autorise ni org_id ni géolocalisation.
 *
 * Le passage initial rejoue `days` jours consécutifs ; les exécutions
 * suivantes n'écrivent que les jours manquants (clé de déduplication
 * déterministe) et ne dupliquent jamais une relation.
 */
import { query } from "../db.js";
import { closeRun, openRun, withRunId } from "../collecte/runs.js";
import { DEPT_LABELS } from "./relevance.js";
import { CERTFR_MISP_SOURCE_ID, urlEvenementMisp } from "./certfr-misp.collector.js";

/** Codes INSEE des douze départements de Nouvelle-Aquitaine. */
const DEPARTEMENTS_NA = Object.keys(DEPT_LABELS);

/** Tolérance UTC entre la date MISP et l'événement régional (en jours). */
const FENETRE_PROXIMITE_JOURS = 2;

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
	observed_at: string | Date | null;
	lat: number | null;
	lon: number | null;
	haystack: string;
}

/** Jour UTC à midi : `date(observed_at)` donne le même jour sous tout fuseau ±12 h. */
function jourUtc(now: Date, decalage: number): Date {
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - decalage, 12));
}

/** Instant UTC minuit du jour porté par une date MISP ou un `observed_at`. */
function jourTimestamp(value: string | Date | null | undefined): number {
  // `pg` renvoie un `Date` pour `timestamptz` : le SQL du corpus, lui, donne
  // une chaîne. Les deux formes doivent porter la même journée UTC.
  const texte = value instanceof Date ? value.toISOString() : value;
  if (!texte) return Number.NaN;
  const t = Date.parse(`${texte.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(t) ? Number.NaN : t;
}

/** Deux faits sont voisins seulement si leurs jours UTC sont proches. */
function sontProches(a: number, b: number): boolean {
  return Number.isFinite(a) && Number.isFinite(b)
    && Math.abs(a - b) <= FENETRE_PROXIMITE_JOURS * 86_400_000;
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
	// Une seule fenêtre pour toutes les requêtes : aucun MISP ancien ni aucun
	// événement régional périmé ne peut fonder une corrélation du jour.
	const fenetreDebut = jourUtc(maintenant, jours - 1 + FENETRE_PROXIMITE_JOURS).toISOString().slice(0, 10);
	const fenetreFin = jourUtc(maintenant, -FENETRE_PROXIMITE_JOURS).toISOString().slice(0, 10);
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
			  WHERE misp_date::date BETWEEN $1::date AND $2::date
			  ORDER BY misp_date DESC, uuid`,
			[fenetreDebut, fenetreFin],
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
		    AND date(e.observed_at) BETWEEN $3::date AND $4::date
		  ORDER BY e.observed_at DESC NULLS LAST, e.id DESC
		  LIMIT 500`,
		[sourceId, DEPARTEMENTS_NA, fenetreDebut, fenetreFin],
	);
	if (regionaux.length === 0) {
		throw new Error(`${sourceId} : aucun événement régional rattaché à une organisation`);
	}

	// Le run est ouvert avant la première corrélation : chaque événement écrit
	// ci-dessous le cite dans `evidence.run_id` (migration 206).
	const runId = await openRun(sourceId);

	const dates: string[] = [];
	let relations = 0;
	let ecrits = 0;
	try {
	for (let i = 0; i < jours; i++) {
		const jour = jourUtc(maintenant, jours - 1 - i);
		const dateJour = jour.toISOString().slice(0, 10);
		if (couverts.has(dateJour)) {
			dates.push(dateJour);
			continue;
		}
		const jourCible = jourTimestamp(dateJour);
		// Plus d'échantillonnage par modulo : un jour ne regarde que les faits
		// dont la date est réellement voisine de la sienne.
		const candidats = corpus.filter((row) => sontProches(jourTimestamp(row.misp_date), jourCible));
		const regionauxDuJour = regionaux.filter((row) => sontProches(jourTimestamp(row.observed_at), jourCible));
		let ecritCeJour = false;

		for (const misp of candidats) {
			const mispJour = jourTimestamp(misp.misp_date);
			const proches = regionauxDuJour.filter((row) => sontProches(jourTimestamp(row.observed_at), mispJour));
			if (proches.length === 0) continue;
			const recoupement = trouverRecoupement(misp, proches);
			let base: BaseCorrelation | null = null;
			let regional: RegionalRow | null = null;
			if (recoupement) {
				base = "semantique";
				regional = recoupement;
			} else if (estRansomware(misp)) {
				// Même catégorie, sans valeur commune : on prend le fait
				// régional le plus proche dans le temps, jamais un index modulo.
				const ransom = proches
					.filter((row) => row.family === "ransomware")
					.sort((a, b) =>
						Math.abs(jourTimestamp(a.observed_at) - mispJour) - Math.abs(jourTimestamp(b.observed_at) - mispJour)
						|| a.id.localeCompare(b.id));
				regional = ransom[0] ?? null;
				if (regional) base = "categorie";
			}
			if (base === null || regional === null) continue;

			const uuid = misp.uuid;
			const confiance = base === "semantique" ? "B2" : "C3";
			const regle = base === "semantique"
				? "certfr-misp:indicateur-partage"
				: "certfr-misp:categorie-commune";
			const ecart = Math.abs(jourTimestamp(regional.observed_at) - mispJour) / 86_400_000;
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
				regionalObservedAt: regional.observed_at,
				regionalOrgId: regional.org_id,
				regionalOrg: regional.org_name,
				correlationRule: regle,
				correlationBasis: base,
				correlationNote: notePour(base),
				correlationDate: dateJour,
				correlationLagDays: ecart,
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
				 urlEvenementMisp(uuid), JSON.stringify(withRunId(evidence, runId)), regional.lat, regional.lon,
				 regional.org_id, base === "semantique" ? "rattachement" : "departement",
				 base === "semantique" ? 8 : 5, regional.org_id === null ? null : "org", dateJour],
			);
			const correlationId = rows[0]?.id;
			if (!correlationId) throw new Error(`corrélation ${dedupKey} non écrite`);
			ecrits++;
			bases[base]++;

			const preuve = JSON.stringify({
				mispUuid: uuid,
				correlationRule: regle,
				correlationBasis: base,
				correlationDate: dateJour,
				regionalEventId: regional.id,
				correlationLagDays: ecart,
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
			ecritCeJour = true;
			break;
		}

		if (!ecritCeJour) {
			// Contexte du jour : aucun recoupement réel, on ne fabrique ni
			// relation ni géolocalisation. Le jour reste visible dans le log.
			bases["contexte-du-jour"]++;
			log(`certfr_misp : ${dateJour} — contexte du jour sans recoupement (${candidats.length} flux MISP, ${regionauxDuJour.length} fait(s) régional(aux)) : aucun événement géolocalisé écrit`);
		}
		dates.push(dateJour);
	}
	} catch (error) {
		await closeRun(runId, { status: "error", error: String((error as Error)?.message ?? error) }).catch(() => {});
		throw error;
	}
	// Le run couvre tout le passage, y compris un passage qui n'écrit rien
	// (jours déjà couverts) : il raconte ce que la corrélation a réellement fait.
	await closeRun(runId, { itemsIn: ecrits, itemsNew: ecrits });

	// Rien de neuf à écrire : le tick serveur repasse souvent, on ne journalise
	// ni ne réécrit l'état d'une source dont les sept jours sont déjà couverts.
	if (ecrits === 0) {
		return { jours: dates, evenements: 0, relations: 0, bases };
	}

	log(`certfr_misp : ${dates.length} jour(s) couvert(s), ${ecrits} corrélation(s) écrite(s), ${relations} relation(s)`);
	return { jours: dates, evenements: ecrits, relations, bases };
}
