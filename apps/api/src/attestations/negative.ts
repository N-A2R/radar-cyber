/**
 * Attestations négatives : rendre l'absence auditable.
 *
 * Une attestation ne prouve pas qu'une organisation est saine ; elle prouve
 * qu'à une date connue, sur une fenêtre explicite, un ensemble de sources
 * actives a été interrogé et qu'aucun événement rattaché à cette organisation
 * n'en est ressorti. La portée est donc le magasin `event` du radar, jamais
 * le monde.
 *
 * Code pur : ni base, ni HTTP, ni horloge. Le générateur (registry.ts), le
 * script de peuplement et les tests partagent ces règles, pour qu'un sceau
 * recalculé ne puisse pas diverger de celui qui a été écrit.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** Méthode inscrite sur chaque ligne : identifie la règle de calcul. */
export const NEGATIVE_ATTESTATION_METHOD = "event-store-window-v1";

/**
 * Plancher de sources. Une « absence » assise sur une ou deux sources est un
 * angle mort déguisé en preuve : on refuse de l'écrire.
 */
export const MIN_SOURCES_CHECKED = 3;

export type NegativeAttestationDraft = {
	orgSlug: string;
	orgName: string;
	entitySource: string | null;
	entityCode: string | null;
	/** Instant ISO 8601 UTC, borne incluse. */
	windowStart: string;
	/** Instant ISO 8601 UTC, borne exclue. */
	windowEnd: string;
	sourcesChecked: number;
	sourceDigest: string;
	eventsFound: number;
	method?: string;
};

export type SignatureMethod = "hmac-sha256" | "sha256-content";

export type SignedNegativeAttestation = NegativeAttestationDraft & {
	method: string;
	signed: true;
	signature: string;
	signatureMethod: SignatureMethod;
	payloadDigest: string;
};

/** Date valide → ISO UTC, sinon erreur explicite (jamais une date inventée). */
export function attestationInstant(value: Date | string, label: string): string {
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) {
		throw new Error(`${label} invalide : ${String(value)}`);
	}
	return date.toISOString();
}

export function normalizeAttestationWindow(
	start: Date | string,
	end: Date | string,
): { windowStart: string; windowEnd: string } {
	const windowStart = attestationInstant(start, "window_start");
	const windowEnd = attestationInstant(end, "window_end");
	if (windowEnd <= windowStart) {
		throw new Error(`fenêtre vide ou inversée : ${windowStart} → ${windowEnd}`);
	}
	return { windowStart, windowEnd };
}

/**
 * Empreinte de l'ensemble des sources interrogées. Triée : l'ordre de la
 * requête SQL n'entre pas dans la preuve. Le doublon est écarté pour que la
 * même liste ne produise pas deux empreintes.
 */
export function sourceScopeDigest(ids: readonly string[]): string {
	const unique = [...new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0))].sort();
	return createHash("sha256").update(unique.join("\n"), "utf8").digest("hex");
}

/**
 * Forme canonique : clés fixes, ordre fixe, JSON compact. Toute évolution du
 * contenu attesté doit passer par ici, sinon les sceaux déjà émis ne se
 * vérifient plus.
 */
export function canonicalAttestationPayload(draft: NegativeAttestationDraft): string {
	return JSON.stringify({
		orgSlug: draft.orgSlug,
		orgName: draft.orgName,
		entitySource: draft.entitySource,
		entityCode: draft.entityCode,
		windowStart: draft.windowStart,
		windowEnd: draft.windowEnd,
		sourcesChecked: draft.sourcesChecked,
		sourceDigest: draft.sourceDigest,
		eventsFound: draft.eventsFound,
		method: draft.method ?? NEGATIVE_ATTESTATION_METHOD,
	});
}

function digest(payload: string): string {
	return createHash("sha256").update(payload, "utf8").digest("hex");
}

function sign(payload: string, key: string | null | undefined): string {
	return typeof key === "string" && key.length > 0
		? createHmac("sha256", key).update(payload, "utf8").digest("hex")
		: digest(payload);
}

/**
 * Scelle un brouillon. Refuse sous le plancher de sources et refuse un
 * `eventsFound` non nul : une attestation négative qui avoue un événement
 * serait un contresens.
 */
export function sealNegativeAttestation(
	draft: NegativeAttestationDraft,
	key?: string | null,
): SignedNegativeAttestation {
	if (!Number.isInteger(draft.sourcesChecked) || draft.sourcesChecked < MIN_SOURCES_CHECKED) {
		throw new Error(
			`sources_checked=${draft.sourcesChecked} sous le plancher de ${MIN_SOURCES_CHECKED} : absence non attestable`,
		);
	}
	if (draft.eventsFound !== 0) {
		throw new Error(`attestation négative impossible : ${draft.eventsFound} événement(s) trouvé(s)`);
	}
	normalizeAttestationWindow(draft.windowStart, draft.windowEnd);
	const method = draft.method ?? NEGATIVE_ATTESTATION_METHOD;
	const payload = canonicalAttestationPayload({ ...draft, method, eventsFound: 0 });
	return {
		...draft,
		eventsFound: 0,
		method,
		signed: true,
		signature: sign(payload, key),
		signatureMethod: typeof key === "string" && key.length > 0 ? "hmac-sha256" : "sha256-content",
		payloadDigest: digest(payload),
	};
}

/**
 * Vérifie une attestation : contenu canonique identique, empreinte identique,
 * sceau recalculé identique. Un faux positif vaut un faux registre, donc toute
 * anomalie renvoie false — l'appelant décide de l'auditer ou non.
 */
export function verifyNegativeAttestation(
	attestation: SignedNegativeAttestation,
	key?: string | null,
): boolean {
	const payload = canonicalAttestationPayload(attestation);
	if (digest(payload) !== attestation.payloadDigest) return false;
	const expected = sign(payload, key);
	if (expected.length !== attestation.signature.length) return false;
	return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(attestation.signature, "hex"));
}
