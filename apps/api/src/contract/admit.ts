/**
 * Admission des événements — le contrat partagé enfin appliqué.
 *
 * `EventSchema` existait dans `@radar/shared` mais n'était **jamais appelé** :
 * cinq chemins d'écriture construisaient leur événement à la main et
 * l'inséraient tel quel. `NormalizedEvent` n'était qu'un `z.infer`, donc une
 * promesse non vérifiée à l'exécution.
 *
 * Ce module est le point d'entrée unique. Il distingue deux sortes d'écart,
 * et c'est toute la question de conception :
 *
 *  - **Réparation** : ce qui est sans ambiguïté (casse d'un code Admiralty,
 *    espaces en trop, sévérité hors bornes, date illisible). On répare et on
 *    **rend la trace** pour que l'appelant la compte et la journalise. Perdre
 *    un incident réel parce qu'une source a écrit « high » au lieu de « B2 »
 *    serait une régression produit, pas de la rigueur.
 *
 *  - **Rejet** : ce qui touche au sens et ne se devine pas — famille inconnue,
 *    nature d'assertion inconnue, provenance absente, clé de déduplication
 *    trop courte. Inventer une famille serait fabriquer la donnée que
 *    l'analyste doit pouvoir contester.
 *
 * Aucune I/O, aucune base : testable seul, appelable d'un collecteur comme
 * d'une route HTTP.
 */
import {
	ASSERTION_TYPES,
	EventSchema,
	FAMILIES,
	GEO_TYPES,
	type NormalizedEvent,
} from "@radar/shared";

/** Écart réparé sans perte de sens. Code stable, pour compter et journaliser. */
export type Repair =
	| "titre-tronque"
	| "titre-espaces"
	| "resume-tronque"
	| "severite-bornes"
	| "severite-arrondie"
	| "severite-illisible"
	| "confidence-casse"
	| "confidence-illisible"
	| "date-illisible"
	| "url-illisible"
	| "geo-type-inconnu"
	| "coordonnees-incompletes"
	| "coordonnees-hors-bornes"
	| "evidence-non-objet";

/** Motif de rejet, stable lui aussi : c'est ce qui s'affiche dans les logs. */
export type Rejection =
	| "cle-dedup-absente"
	| "cle-dedup-trop-courte"
	| "titre-absent"
	| "titre-trop-court"
	| "famille-inconnue"
	| "assertion-inconnue"
	| "source-absente";

export type Admission =
	| { ok: true; event: NormalizedEvent; repairs: Repair[] }
	| { ok: false; rejections: Rejection[]; repairs: Repair[]; hint: string };

const FAMILY_SET = new Set<string>(FAMILIES);
const ASSERTION_SET = new Set<string>(ASSERTION_TYPES);
const GEO_SET = new Set<string>(GEO_TYPES);
const ADMIRALTY = /^[A-F][1-6]$/;

function text(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

/**
 * Valide et normalise un événement candidat.
 *
 * `raw` est volontairement large : collecteurs, endpoint HTTP et briefings
 * Hermes ne produisent pas la même forme. Les champs inconnus sont ignorés —
 * l'appelant garde ses colonnes propres (org_id, date_source…) à côté.
 */
export function admitEvent(raw: Record<string, unknown>): Admission {
	const repairs: Repair[] = [];
	const rejections: Rejection[] = [];
	const repair = (code: Repair) => { if (!repairs.includes(code)) repairs.push(code); };

	// --- Ce qui ne se répare pas : le sens ---------------------------------
	const dedupKey = text(raw.dedupKey);
	if (dedupKey === null) rejections.push("cle-dedup-absente");
	else if (dedupKey.length < 8) rejections.push("cle-dedup-trop-courte");

	const family = text(raw.family);
	if (family === null || !FAMILY_SET.has(family)) rejections.push("famille-inconnue");

	const assertionType = text(raw.assertionType);
	if (assertionType === null || !ASSERTION_SET.has(assertionType)) rejections.push("assertion-inconnue");

	const sourceId = text(raw.sourceId);
	if (sourceId === null) rejections.push("source-absente");

	// --- Titre : réparable, mais pas inventable ----------------------------
	let title = typeof raw.title === "string" ? raw.title : "";
	const collapsed = title.replace(/\s+/g, " ").trim();
	if (collapsed !== title) { title = collapsed; if (title) repair("titre-espaces"); }
	if (title.length > 400) { title = title.slice(0, 400).trimEnd(); repair("titre-tronque"); }
	if (!title) rejections.push("titre-absent");
	else if (title.length < 3) rejections.push("titre-trop-court");

	const hint = title.slice(0, 80) || dedupKey || "(sans titre ni clé)";
	if (rejections.length > 0) return { ok: false, rejections, repairs, hint };

	// --- Résumé -------------------------------------------------------------
	let summary = text(raw.summary);
	if (summary && summary.length > 4000) { summary = summary.slice(0, 4000); repair("resume-tronque"); }

	// --- Sévérité : bornes du contrat, jamais de valeur inventée ------------
	let severity: number | undefined;
	if (raw.severity !== undefined && raw.severity !== null && raw.severity !== "") {
		const numeric = typeof raw.severity === "number" ? raw.severity : Number(raw.severity);
		if (!Number.isFinite(numeric)) {
			repair("severite-illisible");
		} else {
			const rounded = Math.trunc(numeric);
			if (rounded !== numeric) repair("severite-arrondie");
			const clamped = Math.min(5, Math.max(1, rounded));
			if (clamped !== rounded) repair("severite-bornes");
			severity = clamped;
		}
	}

	// --- Confidence : code Admiralty, ou rien -------------------------------
	let confidence: string | undefined;
	const rawConfidence = text(raw.confidence);
	if (rawConfidence) {
		const upper = rawConfidence.toUpperCase();
		if (upper !== rawConfidence) repair("confidence-casse");
		if (ADMIRALTY.test(upper)) confidence = upper;
		else repair("confidence-illisible");
	}

	// --- Date : ISO ou absence, jamais une chaîne douteuse ------------------
	let observedAt: string | undefined;
	const rawDate = text(raw.observedAt);
	if (rawDate) {
		const ms = Date.parse(rawDate);
		if (Number.isFinite(ms)) observedAt = new Date(ms).toISOString();
		else repair("date-illisible");
	}

	// --- URL de provenance --------------------------------------------------
	let sourceUrl: string | undefined;
	const rawUrl = text(raw.sourceUrl);
	if (rawUrl) {
		try { sourceUrl = new URL(rawUrl).toString(); }
		catch { repair("url-illisible"); }
	}

	// --- Géographie ---------------------------------------------------------
	let geoType = text(raw.geoType) ?? "unknown";
	if (!GEO_SET.has(geoType)) { geoType = "unknown"; repair("geo-type-inconnu"); }

	let lat: number | undefined;
	let lon: number | undefined;
	const rawLat = raw.lat === undefined || raw.lat === null || raw.lat === "" ? null : Number(raw.lat);
	const rawLon = raw.lon === undefined || raw.lon === null || raw.lon === "" ? null : Number(raw.lon);
	if (rawLat !== null || rawLon !== null) {
		if (rawLat === null || rawLon === null || !Number.isFinite(rawLat) || !Number.isFinite(rawLon)) {
			repair("coordonnees-incompletes");
		} else if (Math.abs(rawLat) > 90 || Math.abs(rawLon) > 180) {
			repair("coordonnees-hors-bornes");
		} else {
			lat = rawLat;
			lon = rawLon;
		}
	}

	// --- Preuve -------------------------------------------------------------
	let evidence: Record<string, unknown> = {};
	if (raw.evidence !== undefined && raw.evidence !== null) {
		if (typeof raw.evidence === "object" && !Array.isArray(raw.evidence)) {
			evidence = raw.evidence as Record<string, unknown>;
		} else {
			repair("evidence-non-objet");
		}
	}

	// Le contrat tranche en dernier : c'est lui qui fait foi, pas ce module.
	const parsed = EventSchema.safeParse({
		dedupKey, family, assertionType, title,
		summary: summary ?? undefined,
		observedAt, severity, confidence, sourceId, sourceUrl,
		evidence, geoType, lat, lon,
		orgHint: text(raw.orgHint) ?? undefined,
	});

	if (!parsed.success) {
		// Écart non prévu par la normalisation : on le rattache à un motif
		// stable plutôt d'exposer la structure interne de Zod.
		const paths = new Set(parsed.error.issues.map((issue) => issue.path.join(".")));
		if (paths.has("family")) rejections.push("famille-inconnue");
		else if (paths.has("assertionType")) rejections.push("assertion-inconnue");
		else if (paths.has("dedupKey")) rejections.push("cle-dedup-trop-courte");
		else if (paths.has("title")) rejections.push("titre-trop-court");
		else if (paths.has("sourceId")) rejections.push("source-absente");
		else rejections.push("assertion-inconnue");
		return { ok: false, rejections, repairs, hint };
	}

	return { ok: true, event: parsed.data, repairs };
}

/** Compteurs d'admission : rendre le refus visible au lieu de le taire. */
export class AdmissionTally {
	private readonly rejectionCounts = new Map<Rejection, number>();
	private readonly repairCounts = new Map<Repair, number>();
	private admitted = 0;

	record(admission: Admission): void {
		if (admission.ok) this.admitted++;
		else {
			for (const reason of admission.rejections) {
				this.rejectionCounts.set(reason, (this.rejectionCounts.get(reason) ?? 0) + 1);
			}
		}
		for (const code of admission.repairs) {
			this.repairCounts.set(code, (this.repairCounts.get(code) ?? 0) + 1);
		}
	}

	get admittedCount(): number { return this.admitted; }
	get rejectedCount(): number {
		let total = 0;
		for (const n of this.rejectionCounts.values()) total += n;
		return total;
	}

	/** Détail trié par fréquence, pour un log ou une réponse HTTP. */
	detail(): { rejections: Array<{ reason: Rejection; count: number }>; repairs: Array<{ code: Repair; count: number }> } {
		return {
			rejections: [...this.rejectionCounts.entries()].sort((a, b) => b[1] - a[1]).map(([reason, count]) => ({ reason, count })),
			repairs: [...this.repairCounts.entries()].sort((a, b) => b[1] - a[1]).map(([code, count]) => ({ code, count })),
		};
	}

	/** Ligne de log compacte ; vide si rien à signaler. */
	logLine(): string {
		const { rejections, repairs } = this.detail();
		const parts: string[] = [];
		if (rejections.length) parts.push(`rejets : ${rejections.map((r) => `${r.reason}=${r.count}`).join(", ")}`);
		if (repairs.length) parts.push(`réparations : ${repairs.map((r) => `${r.code}=${r.count}`).join(", ")}`);
		return parts.join(" ; ");
	}
}
