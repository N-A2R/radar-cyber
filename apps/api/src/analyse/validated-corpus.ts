/**
 * Correspondance avec le corpus validé versionné.
 *
 * Le corpus (`bench/fixtures/corpus-reference-na.json`) consigne 60 incidents
 * publics de Nouvelle-Aquitaine vérifiés sur pièces : URL de preuve, extrait,
 * date de consultation et éditeur. Un événement n'est pas « dans le corpus »
 * parce qu'il vient du même éditeur : trois degrés distincts, et chacun vaut
 * ce qu'il vaut.
 *
 *   1. `exact`     — URL du corpus, ou entité nommée par le corpus et date voisine ;
 *   2. `publisher` — éditeur cité par le corpus, fait non identifié (signal faible) ;
 *   3. `absent`    — aucune correspondance.
 *
 * Aucune correspondance approximative par similarité : un faux positif
 * (« Guinée » rapproché d'une entité du corpus) est pire qu'un zéro.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { CorpusPresence } from "./confidence-score.js";

const DEFAULT_PATH = fileURLToPath(
	new URL("../../../../bench/fixtures/corpus-reference-na.json", import.meta.url),
);

type CorpusIncident = {
	id: string;
	entite?: string;
	dateIncident?: string;
	datePublique?: string;
	preuve?: { url?: string };
	sourcesAdditionnelles?: { url?: string }[];
};

export type ValidatedCorpus = {
	incidents: number;
	urls: ReadonlySet<string>;
	publishers: ReadonlySet<string>;
	entities: { id: string; words: string[]; start: number | null; end: number | null }[];
};

/** Minuscules, sans accents, ponctuation réduite à des espaces. */
export function normalizeText(text: string): string {
	return text
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function host(url: string): string | null {
	try {
		return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
	} catch {
		return null;
	}
}

function instant(date: string | undefined): number | null {
	if (!date) return null;
	const value = new Date(date).getTime();
	return Number.isFinite(value) ? value : null;
}

/** Charge le corpus versionné. Aucun appel réseau, aucune donnée fabriquée. */
export function loadValidatedCorpus(path: string = DEFAULT_PATH): ValidatedCorpus {
	const raw = JSON.parse(readFileSync(path, "utf8")) as { incidents?: CorpusIncident[] };
	const incidents = raw.incidents ?? [];
	const urls = new Set<string>();
	const publishers = new Set<string>();
	const entities: ValidatedCorpus["entities"] = [];

	for (const incident of incidents) {
		for (const url of [incident.preuve?.url, ...(incident.sourcesAdditionnelles ?? []).map((s) => s.url)]) {
			if (!url) continue;
			urls.add(url);
			const h = host(url);
			if (h) publishers.add(h);
		}
		const start = instant(incident.dateIncident);
		const end = instant(incident.datePublique);
		const words = normalizeText(incident.entite ?? "")
			.split(" ")
			.filter((word) => word.length >= 5)
			.slice(0, 3);
		if (words.length > 0) entities.push({ id: incident.id, words, start, end });
	}
	return { incidents: incidents.length, urls, publishers, entities };
}

/** Deux mois de tolérance : la publication suit l'incident, parfois de loin. */
const CORPUS_WINDOW_MS = 60 * 24 * 3_600_000;

/**
 * Degré de présence d'un événement dans le corpus validé.
 *
 * Le titre et la date sont nécessaires à la correspondance d'entité : sans
 * contexte régional, un article du même éditeur parlant d'ailleurs ne
 * témoigne pas du corpus des incidents de Nouvelle-Aquitaine.
 */
export function corpusPresence(
	event: {
		sourceUrl?: string | null;
		title?: string | null;
		summary?: string | null;
		observedAt?: string | null;
		regional?: boolean;
		orgId?: number | null;
	},
	corpus: ValidatedCorpus,
): CorpusPresence {
	if (event.sourceUrl && corpus.urls.has(event.sourceUrl)) return "exact";

	const date = instant(event.observedAt ?? undefined);
	const text = normalizeText(`${event.title ?? ""} ${event.summary ?? ""}`);
	if (text) {
		for (const entity of corpus.entities) {
			if (!entity.words.every((word) => text.includes(word))) continue;
			const reference = entity.start ?? entity.end;
			if (date !== null && reference !== null && Math.abs(date - reference) > CORPUS_WINDOW_MS) continue;
			return "exact";
		}
	}

	if (event.regional || event.orgId != null) {
		const h = event.sourceUrl ? host(event.sourceUrl) : null;
		if (h && corpus.publishers.has(h)) return "publisher";
	}
	return "absent";
}
