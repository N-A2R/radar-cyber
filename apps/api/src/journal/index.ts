/**
 * Écriture du journal de vérité.
 *
 * Un seul point d'entrée pour que la doctrine soit tenue au même endroit : on
 * n'insère que des faits datés, jamais on ne réécrit. La base le garantit de son
 * côté (triggers de la migration 027) ; ce module garantit que l'appelant
 * fournit le *pourquoi* en même temps que le *quoi*.
 *
 * Le journal n'est pas lu par les fonctionnalités : il sert à l'audit, au rejeu
 * et à la mesure de couverture. Les projections gardent ce rôle, sinon chaque
 * lecture paierait le coût d'un rejeu.
 */
import { ingestQuery } from "../db.js";

/** Nature du fait consigné. Chaque valeur est un contrat avec les outils de rejeu. */
export type JournalKind =
	/** Un événement a franchi la porte d'admission. */
	| "event.admitted"
	/** Un événement a été rattaché à une organisation — ou ne l'a pas été. */
	| "event.rattachement"
	/** Un alias a été retenu ou écarté pour un texte donné. */
	| "match.decided"
	/** Un référentiel a été chargé ou complété. */
	| "referentiel.charged"
	/** Une organisation a changé de nom, de périmètre ou a fusionné. */
	| "org.changed"
	/** Une décision humaine de revue. */
	| "review.decided"
	/** Une alerte a été créée, confirmée ou close. */
	| "alert.changed"
	/** Une source a changé d'état (cassée, réparée, désactivée). */
	| "source.changed";

export type JournalEntry = {
	kind: JournalKind;
	/** Identifiant stable du sujet : jamais un id de projection recréable. */
	subject: string;
	/** Une ligne lisible par un humain. */
	summary: string;
	/** Qui décide : `moteur:gazetteer@2`, `humain:analyste@radar.local`, `collecteur:cert_fr`. */
	actor: string;
	/** Le pourquoi : alias, seuil, version, extrait de texte, règle appliquée. */
	payload?: Record<string, unknown>;
	/** Quand le fait était vrai dans le monde — facultatif, souvent = maintenant. */
	validAt?: Date | string | null;
};

/**
 * Identité des moteurs, journalisée à chaque décision.
 *
 * Sans ça, un changement de moteur est invisible : on ne peut ni mesurer ce
 * qu'il a corrigé, ni rejouer l'ancien comportement pour comparer. C'est
 * exactement le trou qu'a révélé le remplacement du matcher de rattachement.
 */
export const MOTEURS = {
	rattachement: "gazetteer@2",
	admission: "contrat@1",
	detection: "regles@7",
	referentiel: "plan-etendu@1",
} as const;

function toTimestamp(value: Date | string | null | undefined): string | null {
	if (value === null || value === undefined) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Consigne un fait. Ne lève jamais bloquante dans le chemin d'ingestion :
 * un journal indisponible ne doit pas faire perdre un événement. L'échec est
 * rendu à l'appelant, qui décide de le signaler.
 */
export async function consigner(entry: JournalEntry): Promise<{ ok: boolean; error?: string }> {
	try {
		await ingestQuery(
			`INSERT INTO journal (kind, subject, summary, payload, actor, valid_at)
			 VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
			[
				entry.kind,
				entry.subject,
				entry.summary.slice(0, 500),
				JSON.stringify(entry.payload ?? {}),
				entry.actor,
				toTimestamp(entry.validAt),
			],
		);
		return { ok: true };
	} catch (error) {
		return { ok: false, error: String((error as { message?: string })?.message ?? error) };
	}
}

/** Variante groupée : une seule requête pour N faits. Utile en fin de collecte. */
export async function consignerLot(entries: readonly JournalEntry[]): Promise<number> {
	if (entries.length === 0) return 0;
	const valeurs: unknown[] = [];
	const lignes = entries.map((entry, index) => {
		const base = index * 6;
		valeurs.push(
			entry.kind,
			entry.subject,
			entry.summary.slice(0, 500),
			JSON.stringify(entry.payload ?? {}),
			entry.actor,
			toTimestamp(entry.validAt),
		);
		return `($${base + 1},$${base + 2},$${base + 3},$${base + 4}::jsonb,$${base + 5},$${base + 6})`;
	});
	await ingestQuery(
		`INSERT INTO journal (kind, subject, summary, payload, actor, valid_at) VALUES ${lignes.join(",")}`,
		valeurs,
	);
	return entries.length;
}

export type JournalRow = {
	id: number;
	kind: string;
	subject: string;
	summary: string;
	payload: Record<string, unknown>;
	actor: string;
	valid_at: string | null;
	recorded_at: string;
};

/**
 * Relit le journal. `asOf` applique la sémantique bi-temporelle : on ne voit que
 * ce que le système savait à cette date — c'est ce qui permet de répondre à
 * « qu'est-ce qu'on croyait le 3 novembre ? ».
 */
export async function lireJournal(options: {
	kind?: JournalKind;
	subject?: string;
	depuis?: Date | string;
	jusqua?: Date | string;
	asOf?: Date | string;
	limite?: number;
} = {}): Promise<JournalRow[]> {
	const conditions: string[] = [];
	const valeurs: unknown[] = [];
	const ajouter = (sql: string, valeur: unknown) => {
		valeurs.push(valeur);
		conditions.push(sql.replace("?", `$${valeurs.length}`));
	};
	if (options.kind) ajouter("kind = ?", options.kind);
	if (options.subject) ajouter("subject = ?", options.subject);
	if (options.depuis) ajouter("recorded_at >= ?", toTimestamp(options.depuis));
	if (options.jusqua) ajouter("recorded_at <= ?", toTimestamp(options.jusqua));
	if (options.asOf) ajouter("recorded_at <= ?", toTimestamp(options.asOf));
	const limite = Math.min(Math.max(options.limite ?? 200, 1), 5000);
	valeurs.push(limite);
	const { rows } = await ingestQuery<JournalRow>(
		`SELECT id, kind, subject, summary, payload, actor,
		        valid_at::text AS valid_at, recorded_at::text AS recorded_at
		   FROM journal
		  ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
		  ORDER BY recorded_at DESC, id DESC
		  LIMIT $${valeurs.length}`,
		valeurs,
	);
	return rows ?? [];
}

/** Compte les faits par nature — sert à la vérification du socle et à l'écran. */
export async function resumeJournal(): Promise<Record<string, number>> {
	const { rows } = await ingestQuery<{ kind: string; n: string }>(
		"SELECT kind, count(*)::text AS n FROM journal GROUP BY kind ORDER BY kind",
	);
	const out: Record<string, number> = {};
	for (const row of rows ?? []) out[row.kind] = Number(row.n);
	return out;
}
