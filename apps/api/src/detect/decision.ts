/**
 * Client du modèle de décision `mercury-decide`, avec rotation de clés.
 *
 * L'API plafonne le débit par clé (HTTP 429) et peut aussi révoquer une clé
 * (401/403) ou connaître une panne passagère (5xx, réseau). Ce module essaie
 * donc toutes les clés disponibles dans l'ordre, met brièvement en congé une
 * clé fautive et ne promeut `preferred` qu'après une réponse exploitable.
 *
 * Toute défaillance rend `null` : les appelants reprennent alors leur règle
 * déterministe. Ce module ne lève jamais.
 */
import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ENDPOINT = "https://api.inceptionlabs.ai/v1/decisions";
const MODEL = "mercury-decide";
const TIMEOUT_MS = 4000;

/** Congé court : une clé révoquée n'est pas réessayée à chaque événement. */
export const DECISION_KEY_COOLDOWN_MS = 15_000;

type DecisionFetch = (input: string, init?: RequestInit) => Promise<Response>;
type DecisionClientOptions = {
	/** Substitution explicite des clés, pour les tests et les environnements isolés. */
	keys?: readonly string[] | null;
	/** Transport injecté : aucun appel réseau n'est fait par les tests. */
	fetch?: DecisionFetch;
	cooldownMs?: number;
	now?: () => number;
};

let cachedKeys: string[] | null = null;
let keysOverride: readonly string[] | null = null;
let transport: DecisionFetch = (input, init) => globalThis.fetch(input, init);
let cooldownMs = DECISION_KEY_COOLDOWN_MS;
let now = (): number => Date.now();
/** Index de la dernière clé ayant répondu, pour commencer par elle. */
let preferred = 0;
const cooldownUntil = new Map<string, number>();

/** Remplace tout ou partie du client ; les clés modifient la rotation. */
export function configureDecisionClient(options: DecisionClientOptions): void {
	if ("keys" in options) {
		keysOverride = options.keys === undefined || options.keys === null ? null : [...options.keys];
		cachedKeys = null;
		preferred = 0;
		cooldownUntil.clear();
	}
	if (options.fetch) transport = options.fetch;
	if (options.cooldownMs !== undefined) cooldownMs = Math.max(0, options.cooldownMs);
	if (options.now) now = options.now;
}

/** Revient au client réel : aucun état de test ne survit à un appel. */
export function resetDecisionClient(): void {
	keysOverride = null;
	cachedKeys = null;
	transport = (input, init) => globalThis.fetch(input, init);
	cooldownMs = DECISION_KEY_COOLDOWN_MS;
	now = () => Date.now();
	preferred = 0;
	cooldownUntil.clear();
}

/** Lit les clés disponibles : environnement d'abord, puis fichiers d'omp. */
export function decisionApiKeys(): string[] {
	if (cachedKeys) return cachedKeys;
	if (keysOverride) {
		cachedKeys = [...keysOverride];
		return cachedKeys;
	}
	const keys: string[] = [];
	const push = (value: string | undefined) => {
		const trimmed = value?.trim();
		if (trimmed && trimmed.length > 8 && !keys.includes(trimmed)) keys.push(trimmed);
	};

	push(process.env.INCEPTION_API_KEY);

	const dir = join(homedir(), ".omp", "agent");
	try {
		for (const name of readdirSync(dir).sort()) {
			if (!/^inception\d*\.key$/.test(name)) continue;
			try {
				push(readFileSync(join(dir, name), "utf8"));
			} catch {
				// Fichier illisible : on passe au suivant, sans bruit.
			}
		}
	} catch {
		// Pas de répertoire : on reste sur l'environnement.
	}

	cachedKeys = keys;
	return keys;
}

/** Une clé suffit-elle pour activer la fonctionnalité ? */
export function decisionApiKey(): string | null {
	const keys = decisionApiKeys();
	return keys[preferred % keys.length] ?? null;
}

/**
 * Pose une question typée au modèle de décision.
 *
 * Essaie les clés une par une, quelle que soit la cause de l'échec (429,
 * 401/403, 5xx, réseau, JSON inexploitable). Rend `null` si aucune clé ne
 * fournit de réponse exploitable ; la signature publique reste inchangée.
 */
export async function askDecision(state: unknown, questions: unknown): Promise<unknown | null> {
	const keys = decisionApiKeys();
	if (keys.length === 0) return null;

	for (let attempt = 0; attempt < keys.length; attempt++) {
		const index = (preferred + attempt) % keys.length;
		const key = keys[index]!;
		if ((cooldownUntil.get(key) ?? 0) > now()) continue;

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
		try {
			const res = await transport(ENDPOINT, {
				method: "POST",
				signal: controller.signal,
				headers: {
					Authorization: `Bearer ${key}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ model: MODEL, state, questions }),
			});
			if (!res.ok) {
				cooldownUntil.set(key, now() + cooldownMs);
				continue;
			}
			const payload = await res.json();
			cooldownUntil.delete(key);
			preferred = index;
			return payload as unknown;
		} catch {
			cooldownUntil.set(key, now() + cooldownMs);
		} finally {
			clearTimeout(timer);
		}
	}
	return null;
}
