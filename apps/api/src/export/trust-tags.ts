/**
 * Vocabulaire unique des tags de confiance et de diffusion.
 *
 * event.evidence, event.tlp et event.confidence parlent aujourd'hui plusieurs
 * langues (CLEAR/TLP:CLEAR/WHITE, b2/B2, PAP absent). Tout objet partagé passe
 * par ce module :
 *
 *   * une valeur connue est normalisée (casse, alias TLP:AMBER, PAP:CLEAR…) ;
 *   * une valeur explicite inconnue est rejetée — jamais devinée ;
 *   * un tag absent prend la valeur par défaut du produit, la même que celle
 *     de la migration : WHITE (public) pour TLP/PAP, F6 (sans information)
 *     pour Admiralty. « Absent » n'est pas « inconnu » : un collecteur qui ne
 *     publie pas de TLP n'a rien caché, tandis qu'un TLP:ORANGE est une faute
 *     qu'il ne faut pas masquer derrière un défaut.
 *
 * Cette distinction est visible dans le test : evidence sans tag => valeurs
 * par défaut ; evidence avec TLP:ORANGE => UnknownTrustTagError.
 *
 * La table des valeurs et des alias est la même que celle de la migration
 * db/migrate-200-stix-trust-tags.sql ; les clés étrangères de `stix_object`
 * sont le garde-fou côté base.
 */

export const TLP_VALUES = ["WHITE", "GREEN", "AMBER", "RED"] as const;
export const PAP_VALUES = ["WHITE", "GREEN", "AMBER", "RED"] as const;
export type Tlp = (typeof TLP_VALUES)[number];
export type Pap = (typeof PAP_VALUES)[number];

/** Admiralty : fiabilité A-F, crédibilité 1-6. */
export const ADMIRALTY = /^[A-F][1-6]$/;
/** Aucune information de fiabilité/crédibilité n'est disponible. */
export const CONFIDENCE_INCONNUE = "F6";

const TLP_ALIASES: Readonly<Record<string, Tlp>> = {
	CLEAR: "WHITE",
	"TLP:CLEAR": "WHITE",
	WHITE: "WHITE",
	"TLP:WHITE": "WHITE",
	GREEN: "GREEN",
	"TLP:GREEN": "GREEN",
	AMBER: "AMBER",
	"TLP:AMBER": "AMBER",
	RED: "RED",
	"TLP:RED": "RED",
};

const PAP_ALIASES: Readonly<Record<string, Pap>> = {
	CLEAR: "WHITE",
	"PAP:CLEAR": "WHITE",
	WHITE: "WHITE",
	"PAP:WHITE": "WHITE",
	GREEN: "GREEN",
	"PAP:GREEN": "GREEN",
	AMBER: "AMBER",
	"PAP:AMBER": "AMBER",
	RED: "RED",
	"PAP:RED": "RED",
};

export class UnknownTrustTagError extends Error {
	readonly field: "tlp" | "pap" | "confidence";
	readonly value: string;

	constructor(field: "tlp" | "pap" | "confidence", value: string) {
		super(`${field} inconnu : ${JSON.stringify(value)}`);
		this.name = "UnknownTrustTagError";
		this.field = field;
		this.value = value;
	}
}

function absent(raw: unknown): boolean {
	return raw === null || raw === undefined;
}

function cle(raw: unknown, field: "tlp" | "pap" | "confidence"): string {
	if (typeof raw !== "string") throw new UnknownTrustTagError(field, String(raw));
	const value = raw.trim().toUpperCase();
	if (!value) throw new UnknownTrustTagError(field, raw);
	return value;
}

export function normalizeTlp(raw: unknown): Tlp {
	if (absent(raw)) return "WHITE";
	const value = cle(raw, "tlp");
	const tlp = TLP_ALIASES[value];
	if (!tlp) throw new UnknownTrustTagError("tlp", String(raw));
	return tlp;
}

export function normalizePap(raw: unknown): Pap {
	if (absent(raw)) return "WHITE";
	const value = cle(raw, "pap");
	const pap = PAP_ALIASES[value];
	if (!pap) throw new UnknownTrustTagError("pap", String(raw));
	return pap;
}

export function normalizeConfidence(raw: unknown): string {
	if (absent(raw)) return CONFIDENCE_INCONNUE;
	const value = cle(raw, "confidence");
	if (!ADMIRALTY.test(value)) throw new UnknownTrustTagError("confidence", String(raw));
	return value;
}

export type TrustTags = { tlp: Tlp; pap: Pap; confidence: string };

/** Normalise les trois tags en un seul geste, avec les mêmes règles. */
export function normalizeTrustTags(raw: {
	tlp?: unknown;
	pap?: unknown;
	confidence?: unknown;
}): TrustTags {
	return {
		tlp: normalizeTlp(raw.tlp),
		pap: normalizePap(raw.pap),
		confidence: normalizeConfidence(raw.confidence),
	};
}

/** Confidence STIX (0-100) déduite de la crédibilité Admiralty. */
export function stixConfidence(code: string): number {
	if (!ADMIRALTY.test(code)) throw new UnknownTrustTagError("confidence", code);
	const credibilite = Number(code[1]);
	return ({ 1: 100, 2: 90, 3: 70, 4: 50, 5: 25, 6: 0 } as Record<number, number>)[credibilite];
}
