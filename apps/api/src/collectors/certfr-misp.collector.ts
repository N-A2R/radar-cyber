/**
 * Flux MISP public du CERT-FR — ingestion TLP:CLEAR, sans perte utile.
 *
 * Le manifeste du feed donne les UUID des événements ; chaque événement est
 * ensuite lu dans son propre fichier JSON. Seuls les événements portant
 * explicitement `tlp:clear` (ou `cert-fr:TLP="clear"`, ou le `tlp:white`
 * historique) sont admis : un indicateur classifié ne doit jamais entrer dans
 * le radar.
 *
 * « Sans perte » veut dire : les attributs d'objet MISP (`Event.Object[].Attribute`,
 * 661 attributs sur le flux de novembre 2026) comptent autant que les attributs
 * directs, et le contexte non personnel (cibles, liens, pièces jointes,
 * commentaires, dates) est conservé à part des indicateurs.
 *
 * Ce qui est conservé, et où :
 *  - `certfr_misp_event` : un enregistrement par UUID (date de publication,
 *    info, organisation, comptes et types d'attributs, valeurs techniques
 *    complètes, contexte). Cette table ne dépend pas de la rétention de
 *    `event`, qui archive au bout de 90 jours un événement MISP daté de 2020.
 *  - `indicator` : chaque attribut technique (domain, ip, url, hash, filename…)
 *    comme indicateur TLP:CLEAR, réutilisable par la détection.
 *  - `event` : un événement par UUID MISP, avec `mispUuid` dans `evidence`.
 *
 * Ce qui n'est jamais copié : les attributs porteurs de données personnelles
 * (courriel, téléphone, registrant Whois) et les pièces jointes qui déclarent
 * un TLP plus restrictif que CLEAR.
 */
import type { Collector, NormalizedEvent } from "@radar/shared";
import { ingestQuery } from "../db.js";

export const CERTFR_MISP_SOURCE_ID = "certfr_misp";
export const CERTFR_MISP_FEED_BASE = "https://misp.cert.ssi.gouv.fr/feed-misp/";
export const CERTFR_MISP_MANIFEST_URL = `${CERTFR_MISP_FEED_BASE}manifest.json`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Borne de sécurité : le feed public compte moins de 100 événements. */
const MAX_EVENTS = 500;
/** Longueur maximale d'une valeur de contexte conservée (commentaires). */
const MAX_CONTEXTE = 800;

/**
 * Types d'attribut qui portent un indicateur technique. Tout le reste est
 * contextuel (commentaire, lien, date, cible) ou personnel (courriel,
 * téléphone) : ni compté comme indicateur, ni copié.
 */
const TYPES_TECHNIQUES: Readonly<Record<string, true>> = {
	domain: true, hostname: true, "ip-src": true, "ip-dst": true,
	"ip-src|port": true, "ip-dst|port": true, url: true, uri: true,
	md5: true, sha1: true, sha256: true, sha512: true, ssdeep: true,
	imphash: true, authentihash: true, filename: true, mutex: true,
	regkey: true, "user-agent": true, "ja3-fingerprint-md5": true,
	cve: true, vulnerability: true,
};

/** Types explicitement personnels : jamais copiés, jamais comptés. */
const TYPES_PERSONNELS = /^(email|phone|target-email|target-phone|whois-registrant)/i;

/** Une pièce jointe qui déclare un TLP plus restrictif n'est pas recopiée. */
const ATTACHEMENT_RESTREINT = /tlp[:_\s-]?(green|amber|red)/i;

/**
 * Groupes et familles nommés par le CERT-FR. Glossaire fermé : un mot générique
 * (« ransomware », « malware ») ne crée jamais de corrélation.
 */
const ACTEURS = [
	"apt\\s?\\d{1,2}", "ta\\s?\\d{3,5}", "unc\\s?\\d{3,5}", "fin\\s?\\d{1,2}",
	"uac[- ]?\\d{3,5}", "lazarus", "sandworm", "nobelium", "lockean", "dridex",
	"egregor", "maze", "silence", "telebots", "wineloader", "hermeticwizard",
	"isaacwiper", "cyclops blink", "exaramel", "sdbot", "emotet", "trickbot",
	"qakbot", "conti", "lockbit", "revil", "clop", "akira", "qilin", "ransomhub",
] as const;
const ACTEUR_RE = new RegExp(`(?:^|[^a-z0-9])(?:${ACTEURS.join("|")})(?![a-z0-9])`, "i");
const ACTEUR_GLOBAL_RE = new RegExp(`(?:${ACTEURS.join("|")})`, "gi");
const GALAXY_ACTEUR_RE = /^misp-galaxy:(?:threat-actor|malpedia)="?([^"]+)"?$/i;

export interface IndicateurMisp {
	type: string;
	value: string;
}

export interface ContexteMisp {
	labels: string[];
	targetLocations: string[];
	urls: string[];
	attachments: string[];
	comments: string[];
	dates: string[];
}

export interface EvenementMisp {
	uuid: string;
	mispDate: string;
	info: string;
	orgName: string;
	confidence?: string;
	/** Attributs techniques, valeurs comprises. */
	indicateurs: IndicateurMisp[];
	/** Types d'attribut rencontrés (hors types personnels). */
	typesAttributs: string[];
	/** Nombre d'attributs par type (hors types personnels). */
	typesComptes: Record<string, number>;
	/** Attributs non supprimés lus, toutes catégories, objets compris. */
	attributsLus: number;
	/** Objets MISP lus. */
	objetsLus: number;
	/** Contexte non personnel. */
	contexte: ContexteMisp;
}

function record(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? value as Record<string, unknown>
		: null;
}

function tagNames(value: unknown): string[] {
	const list = Array.isArray(value) ? value : value ? [value] : [];
	const names: string[] = [];
	for (const item of list) {
		const direct = record(item);
		if (direct) {
			const name = direct.name;
			if (typeof name === "string" && name.trim()) names.push(name.trim());
			continue;
		}
		if (typeof item === "string" && item.trim()) names.push(item.trim());
	}
	return names;
}

/**
 * TLP:CLEAR explicite, sans tag TLP plus restrictif à côté. `tlp:white` est
 * l'ancien nom de CLEAR et reste admis ; `tlp:green|amber|red` prime et rejette.
 */
export function estTlpClear(tags: unknown): boolean {
	let clear = false;
	let restreint = false;
	for (const nom of tagNames(tags)) {
		const n = nom.toLowerCase();
		if (n === "tlp:clear" || n === "tlp:white") clear = true;
		else if (/^tlp:(amber|red|green)\b/.test(n)) restreint = true;
		const certFr = /^cert-fr:tlp="?([^"]*)"?$/.exec(n);
		if (certFr) {
			if (certFr[1]?.trim() === "clear") clear = true;
			else restreint = true;
		}
	}
	return clear && !restreint;
}

export interface ManifestEntry {
	uuid: string;
	date: string;
	info: string;
	tags: unknown;
	orgc: Record<string, unknown> | null;
}

/** Manifeste MISP : soit une map UUID → entrée, soit `{Event: [...]}`. */
export function parserManifeste(raw: unknown): ManifestEntry[] {
	const root = record(raw);
	if (!root) return [];
	const items: unknown[] = Array.isArray(root.Event)
		? root.Event
		: Object.entries(root).map(([uuid, value]) => {
			const row = record(value);
			return row ? { uuid, ...row } : null;
		});
	const entrees: ManifestEntry[] = [];
	for (const item of items) {
		const row = record(item);
		if (!row) continue;
		const uuid = String(row.uuid ?? "").trim();
		if (!UUID_RE.test(uuid)) continue;
		entrees.push({
			uuid,
			date: String(row.date ?? "").trim(),
			info: String(row.info ?? "").trim(),
			tags: row.Tag ?? row.tags ?? [],
			orgc: record(row.Orgc),
		});
	}
	return entrees;
}

export function urlEvenementMisp(uuid: string): string {
	return `${CERTFR_MISP_FEED_BASE}${uuid}.json`;
}

function confianceMisp(tags: unknown): string | undefined {
	const fiabilite = tagNames(tags)
		.map((n) => /^cert-fr:fiabilit[eé]="?([^"]+)"?$/i.exec(n))
		.find((m) => m !== null);
	const valeur = fiabilite?.[1]?.toLowerCase();
	if (valeur === "bonne") return "B2";
	if (valeur === "moderee" || valeur === "modérée") return "C2";
	return undefined;
}

/** Normalise une valeur d'attribut : trim, wildcard MISP retiré en fin d'URL. */
function valeurUtile(type: string, brut: unknown): string | null {
	if (typeof brut !== "string") return null;
	let value = brut.trim();
	if (!value) return null;
	if ((type === "url" || type === "uri") && value.endsWith("*")) value = value.slice(0, -1);
	return value || null;
}

/** Attributs directs **et** attributs d'objets, non supprimés. */
function attributsPlats(evenement: Record<string, unknown>): Record<string, unknown>[] {
	const plats: Record<string, unknown>[] = [];
	const direct = Array.isArray(evenement.Attribute) ? evenement.Attribute : [];
	for (const item of direct) {
		const attribut = record(item);
		if (attribut) plats.push(attribut);
	}
	const objets = Array.isArray(evenement.Object) ? evenement.Object : [];
	for (const item of objets) {
		const objet = record(item);
		if (!objet) continue;
		const nested = Array.isArray(objet.Attribute) ? objet.Attribute : [];
		for (const attribut of nested) {
			const row = record(attribut);
			if (row) plats.push(row);
		}
	}
	return plats.filter((a) => {
		const supprime = a.deleted;
		return !(supprime === true || supprime === 1 || supprime === "1"
			|| String(supprime ?? "").toLowerCase() === "true");
	});
}

function compterObjets(evenement: Record<string, unknown>): number {
	const objets = Array.isArray(evenement.Object) ? evenement.Object : [];
	return objets.filter((o) => {
		const objet = record(o);
		if (!objet) return false;
		const supprime = objet.deleted;
		return !(supprime === true || supprime === 1 || supprime === "1"
			|| String(supprime ?? "").toLowerCase() === "true");
	}).length;
}

/** Libellés d'acteur explicitement nommés par le producteur. */
function labelsDepuis(tags: unknown, attributes: Record<string, unknown>[], info: string): string[] {
	const labels = new Set<string>();
	for (const nom of tagNames(tags)) {
		const match = GALAXY_ACTEUR_RE.exec(nom.trim());
		if (match?.[1]) labels.add(match[1].toLowerCase().replace(/\s+/g, " ").trim());
	}
	for (const attribut of attributes) {
		if (String(attribut.type ?? "").toLowerCase() !== "text") continue;
		const value = String(attribut.value ?? "").trim();
		if (value && ACTEUR_RE.test(value)) labels.add(value.toLowerCase());
	}
	for (const match of info.matchAll(ACTEUR_GLOBAL_RE)) {
		labels.add(match[0].toLowerCase().replace(/\s+/g, " "));
	}
	return [...labels].sort();
}

function ajouterContexte(cible: string[], valeur: unknown): void {
	const value = String(valeur ?? "").trim();
	if (!value) return;
	cible.push(value.length > MAX_CONTEXTE ? value.slice(0, MAX_CONTEXTE) : value);
}

/**
 * Conversion pure : manifeste + corps d'événements → corpus MISP.
 * `bodies` est indexé par UUID ; un corps manquant est simplement ignoré.
 */
export function corpusDepuisFluxMisp(
	manifeste: unknown,
	bodies: Record<string, unknown>,
): EvenementMisp[] {
	const entrees = parserManifeste(manifeste);
	const corpus: EvenementMisp[] = [];
	for (const entree of entrees) {
		const root = record(bodies[entree.uuid]);
		const evenement = record(root?.Event ?? root) ?? {};
		const uuid = String(evenement.uuid ?? entree.uuid).trim();
		if (!UUID_RE.test(uuid)) continue;
		const tags = Array.isArray(evenement.Tag) && evenement.Tag.length > 0
			? evenement.Tag
			: entree.tags;
		if (!estTlpClear(tags)) continue;
		const date = String(evenement.date ?? entree.date).trim();
		if (!DATE_RE.test(date)) continue;

		const attributes = attributsPlats(evenement);
		const indicateurs: IndicateurMisp[] = [];
		const vus = new Set<string>();
		const typesComptes: Record<string, number> = {};
		const contexte: ContexteMisp = {
			labels: [], targetLocations: [], urls: [], attachments: [], comments: [], dates: [],
		};
		for (const attribut of attributes) {
			const type = String(attribut.type ?? "").trim().toLowerCase();
			if (!type || TYPES_PERSONNELS.test(type)) continue;
			typesComptes[type] = (typesComptes[type] ?? 0) + 1;
			if (Object.hasOwn(TYPES_TECHNIQUES, type)) {
				const value = valeurUtile(type, attribut.value);
				if (value && !vus.has(`${type}\u0000${value}`)) {
					vus.add(`${type}\u0000${value}`);
					indicateurs.push({ type, value });
				}
				continue;
			}
			switch (type) {
				case "target-location": ajouterContexte(contexte.targetLocations, attribut.value); break;
				case "link": ajouterContexte(contexte.urls, attribut.value); break;
				case "attachment": {
					const nom = String(attribut.value ?? "").trim();
					if (nom && !ATTACHEMENT_RESTREINT.test(nom)) ajouterContexte(contexte.attachments, nom);
					break;
				}
				case "comment": ajouterContexte(contexte.comments, attribut.value); break;
				case "datetime": case "date": ajouterContexte(contexte.dates, attribut.value); break;
				default: break;
			}
		}
		const info = String(evenement.info ?? entree.info).trim() || `Événement MISP CERT-FR ${uuid}`;
		contexte.labels = labelsDepuis(tags, attributes, info);
		for (const key of Object.keys(contexte) as (keyof ContexteMisp)[]) {
			contexte[key] = [...new Set(contexte[key])].sort();
		}

		const orga = record(evenement.Orgc) ?? entree.orgc;
		corpus.push({
			uuid,
			mispDate: date,
			info,
			orgName: String(orga?.name ?? "CERT-FR").trim() || "CERT-FR",
			confidence: confianceMisp(tags),
			indicateurs,
			typesAttributs: Object.keys(typesComptes).sort(),
			typesComptes,
			attributsLus: attributes.length,
			objetsLus: compterObjets(evenement),
			contexte,
		});
	}
	return corpus;
}

/** Un événement du radar par UUID MISP ; l'UUID reste dans `evidence`. */
export function eventNormalise(evenement: EvenementMisp): NormalizedEvent {
	const types = [...new Set(evenement.indicateurs.map((i) => i.type))].sort();
	return {
		dedupKey: `certfr-misp:${evenement.uuid}`,
		family: "cti",
		assertionType: "technical_indicator",
		title: `[CERT-FR MISP] ${evenement.info}`.slice(0, 400),
		summary: `${evenement.orgName} — ${evenement.indicateurs.length} indicateur(s) TLP:CLEAR : ${types.join(", ") || "aucun attribut technique"}`,
		observedAt: `${evenement.mispDate}T00:00:00.000Z`,
		severity: 3,
		confidence: evenement.confidence,
		sourceId: CERTFR_MISP_SOURCE_ID,
		sourceUrl: urlEvenementMisp(evenement.uuid),
		evidence: {
			uuid: evenement.uuid,
			mispUuid: evenement.uuid,
			mispDate: evenement.mispDate,
			tlp: "clear",
			orgName: evenement.orgName,
			attributeCount: evenement.attributsLus,
			objectCount: evenement.objetsLus,
			indicatorCount: evenement.indicateurs.length,
			indicatorTypes: types,
			labels: evenement.contexte.labels,
			targetLocations: evenement.contexte.targetLocations,
			feed: CERTFR_MISP_MANIFEST_URL,
		},
		geoType: "unknown",
	};
}

/**
 * Écrit le corpus durable et les indicateurs. Le corpus ne dépend pas de la
 * rétention de `event` ; `last_fetched_at` prouve la relecture quotidienne.
 */
export async function enregistrerCorpusMisp(corpus: EvenementMisp[]): Promise<{ evenements: number; indicateurs: number }> {
	for (const evenement of corpus) {
		await ingestQuery(
			`INSERT INTO certfr_misp_event
			   (uuid, misp_date, info, org_name, tlp, attribute_count, object_count,
			    attribute_types, attribute_type_counts, indicators, context, feed_url)
			 VALUES ($1, $2::date, $3, $4, 'clear', $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11)
			 ON CONFLICT (uuid) DO UPDATE SET
			   misp_date = EXCLUDED.misp_date,
			   info = EXCLUDED.info,
			   org_name = EXCLUDED.org_name,
			   attribute_count = EXCLUDED.attribute_count,
			   object_count = EXCLUDED.object_count,
			   attribute_types = EXCLUDED.attribute_types,
			   attribute_type_counts = EXCLUDED.attribute_type_counts,
			   indicators = EXCLUDED.indicators,
			   context = EXCLUDED.context,
			   feed_url = EXCLUDED.feed_url,
			   last_fetched_at = now()`,
			[
				evenement.uuid, evenement.mispDate, evenement.info, evenement.orgName,
				evenement.attributsLus, evenement.objetsLus,
				JSON.stringify(evenement.typesAttributs), JSON.stringify(evenement.typesComptes),
				JSON.stringify(evenement.indicateurs), JSON.stringify(evenement.contexte),
				urlEvenementMisp(evenement.uuid),
			],
		);
	}

	// UNIQUE (type, value) : une même valeur peut revenir dans deux événements
	// du flux, elle ne doit être insérée qu'une fois par lot.
	const uniques = new Map<string, { type: string; value: string; confidence: string | null }>();
	for (const evenement of corpus) {
		for (const indicateur of evenement.indicateurs) {
			const key = `${indicateur.type}\u0000${indicateur.value}`;
			if (!uniques.has(key)) {
				uniques.set(key, { ...indicateur, confidence: evenement.confidence ?? null });
			}
		}
	}
	const lignes = [...uniques.values()];
	if (lignes.length > 0) {
		await ingestQuery(
			`INSERT INTO indicator (type, value, first_seen, last_seen, tlp, confidence, source_id)
			 SELECT type, value, now(), now(), 'CLEAR', confidence, $4
			   FROM unnest($1::text[], $2::text[], $3::text[]) AS t(type, value, confidence)
			 ON CONFLICT (type, value) DO UPDATE SET
			   last_seen = now(),
			   confidence = COALESCE(indicator.confidence, EXCLUDED.confidence)`,
			[lignes.map((l) => l.type), lignes.map((l) => l.value), lignes.map((l) => l.confidence), CERTFR_MISP_SOURCE_ID],
		);
	}
	// L'ingestion réussie est ce qui prouve la fraîcheur du flux : c'est ici,
	// et jamais dans la corrélation, que `last_ok_at` est renseigné. Un corpus
	// ancien ne peut donc pas garder la source « saine » alors que le feed
	// ne répond plus.
	await ingestQuery(
		`UPDATE source
		    SET last_ok_at = now(), last_error = NULL, last_error_at = NULL,
		        echecs_consecutifs = 0, items_total = $2, last_items = $2
		  WHERE id = $1`,
		[CERTFR_MISP_SOURCE_ID, corpus.length],
	);
	return { evenements: corpus.length, indicateurs: lignes.length };
}

export const collector: Collector = {
	id: CERTFR_MISP_SOURCE_ID,
	family: "cti",
	intervalSec: 86400,
	async run(ctx) {
		const manifeste = await ctx.fetchJson<unknown>(CERTFR_MISP_MANIFEST_URL);
		const entrees = parserManifeste(manifeste);
		if (entrees.length === 0) throw new Error("manifeste MISP CERT-FR vide ou illisible");
		const bodies: Record<string, unknown> = {};
		const illisibles: string[] = [];
		for (const entree of entrees.slice(0, MAX_EVENTS)) {
			try {
				bodies[entree.uuid] = await ctx.fetchJson<unknown>(urlEvenementMisp(entree.uuid));
			} catch (error) {
				illisibles.push(entree.uuid);
				ctx.log(`certfr_misp : événement ${entree.uuid} illisible — ${String(error)}`);
			}
		}
		const corpus = corpusDepuisFluxMisp(manifeste, bodies);
		if (corpus.length === 0) throw new Error("aucun événement TLP:CLEAR exploitable dans le flux MISP CERT-FR");
		const ecrit = await enregistrerCorpusMisp(corpus);
		return {
			events: corpus.map(eventNormalise),
			cursor: {
				lastRun: ctx.now().toISOString(),
				manifestEntries: entrees.length,
				read: Object.keys(bodies).length,
				admitted: corpus.length,
				unreadable: illisibles.length,
				unreadableIds: illisibles.slice(0, 20),
				attributes: corpus.reduce((total, e) => total + e.attributsLus, 0),
				indicators: ecrit.indicateurs,
			},
		};
	},
};
