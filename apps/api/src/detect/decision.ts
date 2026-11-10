/**
 * Client du modèle de décision `mercury-decide`, avec rotation de clés.
 *
 * L'API plafonne le débit par clé (HTTP 429). La machine en détient plusieurs :
 * celle du service (`INCEPTION_API_KEY`) et celles enregistrées pour omp
 * (`~/.omp/agent/inception*.key`). Ce module les essaie dans l'ordre et retient
 * celle qui a répondu, pour ne pas repayer l'erreur à chaque appel.
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

let cachedKeys: string[] | null = null;
/** Index de la dernière clé qui a répondu, pour commencer par elle. */
let preferred = 0;

/** Lit les clés disponibles : environnement d'abord, puis fichiers d'omp. */
export function decisionApiKeys(): string[] {
	if (cachedKeys) return cachedKeys;
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
	return decisionApiKeys()[0] ?? null;
}

/**
 * Pose une question typée au modèle de décision.
 * Essaie les clés à tour de rôle sur 429 ; rend `null` si aucune ne répond.
 */
export async function askDecision(state: unknown, questions: unknown): Promise<unknown | null> {
	const keys = decisionApiKeys();
	if (keys.length === 0) return null;

	for (let attempt = 0; attempt < keys.length; attempt++) {
		const index = (preferred + attempt) % keys.length;
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
		try {
			const res = await fetch(ENDPOINT, {
				method: "POST",
				signal: controller.signal,
				headers: {
					Authorization: `Bearer ${keys[index]}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ model: MODEL, state, questions }),
			});
			if (res.status === 429) continue;
			if (!res.ok) return null;
			preferred = index;
			return (await res.json()) as unknown;
		} catch {
			return null;
		} finally {
			clearTimeout(timer);
		}
	}
	return null;
}
