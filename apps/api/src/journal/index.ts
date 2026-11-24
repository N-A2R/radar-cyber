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
import { MOTEUR_RATTACHEMENT } from "../match/versions.js";

/** Nature du fait consigné. Chaque valeur est un contrat avec les outils de rejeu. */
export type JournalKind =
	| "event.admitted"
	/** Un événement refusé par le contrat d'admission : le motif reste auditable. */
	| "event.rejected"
	/** Un fait déjà admis a vu des colonnes corrigées par sa source. */
	| "event.updated"
	/** Un événement a été rattaché à une organisation — ou ne l'a pas été. */
	| "event.rattachement"
	/** Un alias a été retenu ou écarté pour un texte donné. */
	| "match.decided"
	/** Un rattachement produit par le moteur a été refusé par une règle de
	 * précision (drapeau `PRECISION_RULES=on`) — le fait porte la règle. */
	| "match.refuse"
	/** Un référentiel a été chargé ou complété. */
	| "referentiel.charged"
	/** Une organisation a été créée depuis un indice de revendication. */
	| "org.created"
	/** Une organisation a changé de nom, de périmètre ou a fusionné. */
	| "org.changed"
	/** Une décision humaine de revue. */
	| "review.decided"
	/** Une alerte a été créée, confirmée ou close. */
	| "alert.changed"
	/** Une décision de détection (refus inclus) et son motif, pour auditer les faux négatifs. */
	| "detection.decision"
	/** Une source a changé d'état (cassée, réparée, désactivée). */
	| "source.changed"
	/** Une source a été déclarée morte après une série d'échecs. */
	| "source.morte"
	/** Un fait visé n'a pas pu être écrit : le journal se souvient du trou. */
	| "journal.lacune"
	/** Un lot a été retiré de la table de lecture ou du brut quarantaine — jamais sans trace. */
	| "event.purge"
	/** Un accès API a été refusé (rôle, jeton, route inconnue, débit). */
	| "acces.refus"
	/** Une organisation nommée a demandé une rectification. */
	| "droit_reponse.demande"
	| "event.dedup"
	/** Une demande de rectification a changé de statut (publication comprise). */
	| "droit_reponse.decision"
	/** Une violation RGPD a changé de statut dans le registre opérationnel. */
	| "violation.rgpd"
	/** Une décision de publier un incident NA, ou de le refuser sous `publication-risquee`. */
	| "publication.decided";

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
	rattachement: MOTEUR_RATTACHEMENT,
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
 * Les octets nuls rendent une insertion refusable par PostgreSQL (`invalid byte
 * sequence`), et une seule ligne toxique ne doit pas faire perdre un lot. Les
 * flux venus du web en contiennent parfois ; le journal les retire, ils
 * n'apportent jamais d'information.
 */
function sansNul(valeur: string): string {
	return valeur.replace(/\u0000/g, "");
}

/** Idem sur du texte JSON déjà sérialisé, où le nul est une séquence d'échappement. */
function sansNulJson(json: string): string {
	return json.replace(/\\u0000/g, "");
}

/**
 * Consigne un fait. Ne lève jamais bloquante dans le chemin d'ingestion :
 * un journal indisponible ne doit pas faire perdre un événement. L'échec est
 * rendu à l'appelant, qui décide de le signaler.
 */
/**
 * Ce dont `consignerAvec` a besoin : la méthode `query` d'un client de
 * transaction (`PoolClient`) ou la fonction d'ingestion hors transaction.
 * On ne déclare que ce qui est utilisé, pour que les deux s'y conforment
 * sans conversion de type.
 */
export type JournalRunner = (text: string, params?: readonly unknown[]) => Promise<{ rows: unknown[] }>;

/** Consigne un fait via un runner donné (transaction ou non). */
export async function consignerAvec(run: JournalRunner, entry: JournalEntry): Promise<{ ok: boolean; error?: string }> {
	try {
		await run(
			`INSERT INTO journal (kind, subject, summary, payload, actor, valid_at)
			 VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
			[
				entry.kind,
				sansNul(entry.subject),
				sansNul(entry.summary).slice(0, 500),
				sansNulJson(JSON.stringify(entry.payload ?? {})),
				entry.actor,
				toTimestamp(entry.validAt),
			],
		);
		return { ok: true };
	} catch (error) {
		return { ok: false, error: String((error as { message?: string })?.message ?? error) };
	}
}

export async function consigner(entry: JournalEntry): Promise<{ ok: boolean; error?: string }> {
	return consignerAvec((sql, params) => ingestQuery(sql, params ? [...params] : undefined), entry);
}

/**
 * Ce que la consigne groupée a réellement écrit. La doctrine du journal tient en
 * trois nombres : les faits posés, les trous remplacés par une lacune consignée
 * (le journal se souvient du trou au lieu de l'oublier), et ce qui reste sans
 * aucune trace — cas catastrophique (journal indisponible) rendu à l'appelant
 * pour qu'il le signale, jamais avalé en silence.
 */
export type LotResultat = {
	/** Faits écrits, lacunes consignées comprises. */
	consignes: number;
	/** Faits remplacés par un fait `journal.lacune`. */
	lacunes: number;
	/** Faits restés sans trace écrite : message d'erreur par fait. */
	erreurs: string[];
};

/** 250 faits × 6 paramètres par requête : loin du plafond de 65 535 du protocole. */
const TAILLE_PAQUET = 250;

/** Construit et écrit un paquet de faits en une requête. */
async function insererPaquet(run: JournalRunner, paquet: readonly JournalEntry[]): Promise<void> {
	const valeurs: unknown[] = [];
	const lignes = paquet.map((entry, index) => {
		const base = index * 6;
		valeurs.push(
			entry.kind,
			sansNul(entry.subject),
			sansNul(entry.summary).slice(0, 500),
			sansNulJson(JSON.stringify(entry.payload ?? {})),
			entry.actor,
			toTimestamp(entry.validAt),
		);
		return `($${base + 1},$${base + 2},$${base + 3},$${base + 4}::jsonb,$${base + 5},$${base + 6})`;
	});
	await run(
		`INSERT INTO journal (kind, subject, summary, payload, actor, valid_at) VALUES ${lignes.join(",")}`,
		valeurs,
	);
}

function texteErreur(erreur: unknown): string {
	return erreur instanceof Error ? erreur.message : String(erreur);
}

/**
 * Isole une tentative dans un savepoint quand le runner est transactionnel :
 * un INSERT refusé laisse la transaction avortée, sans quoi la lacune prévue
 * pour ce fait serait elle aussi refusée. Hors transaction (pool), aucun
 * savepoint n'est émis — le pool isole déjà chaque requête.
 */
async function avecSavepoint<T>(
	run: JournalRunner,
	nom: string,
	actif: boolean,
	action: () => Promise<T>,
): Promise<T> {
	if (!actif) return action();
	await run(`SAVEPOINT ${nom}`);
	try {
		const valeur = await action();
		await run(`RELEASE SAVEPOINT ${nom}`);
		return valeur;
	} catch (erreur) {
		await run(`ROLLBACK TO SAVEPOINT ${nom}`).catch(() => {});
		await run(`RELEASE SAVEPOINT ${nom}`).catch(() => {});
		throw erreur;
	}
}

/**
 * Variante groupée : les faits partent par paquets, et un paquet qui échoue est
 * rejoué ligne à ligne. Une ligne qui échoue encore devient un fait
 * `journal.lacune` : le journal se souvient du trou au lieu de l'oublier. Un
 * paquet n'est jamais abandonné — chaque fait resté sans trace porte son propre
 * message d'erreur. Avec un runner transactionnel, chaque tentative est isolée
 * par un savepoint pour qu'une lacune puisse être écrite après un refus.
 */
export async function consignerLotAvec(
	run: JournalRunner,
	entries: readonly JournalEntry[],
	options: { transactionnel?: boolean } = {},
): Promise<LotResultat> {
	const resultat: LotResultat = { consignes: 0, lacunes: 0, erreurs: [] };
	if (entries.length === 0) return resultat;
	const transactionnel = options.transactionnel === true;
	let numeroSavepoint = 0;
	for (let debut = 0; debut < entries.length; debut += TAILLE_PAQUET) {
		const paquet = entries.slice(debut, debut + TAILLE_PAQUET);
		try {
			await avecSavepoint(run, `radar_journal_paquet_${numeroSavepoint++}`, transactionnel,
				() => insererPaquet(run, paquet));
			resultat.consignes += paquet.length;
			continue;
		} catch {
			// Repli ligne à ligne : isoler ce qui refuse, garder le reste.
		}
		for (const entry of paquet) {
			// Le fait et sa lacune sont deux tentatives distinctes : un refus du
			// fait ne doit pas empêcher d'écrire la trace du trou.
			let pose: { ok: boolean; error?: string };
			try {
				pose = await avecSavepoint(run, `radar_journal_fait_${numeroSavepoint++}`, transactionnel,
					() => consignerAvec(run, entry));
			} catch (erreur) {
				pose = { ok: false, error: texteErreur(erreur) };
			}
			if (pose.ok) {
				resultat.consignes++;
				continue;
			}
			const erreur = pose.error ?? "erreur inconnue";
			const lacune: JournalEntry = {
				kind: "journal.lacune",
				subject: entry.subject,
				summary: `lacune : ${entry.kind} non consigné — ${erreur}`,
				actor: "journal:lacune@1",
				payload: { kindVise: entry.kind, sujetVise: entry.subject, erreur },
				validAt: entry.validAt ?? null,
			};
			let trace: { ok: boolean; error?: string };
			try {
				trace = await avecSavepoint(run, `radar_journal_lacune_${numeroSavepoint++}`, transactionnel,
					() => consignerAvec(run, lacune));
			} catch (erreur) {
				trace = { ok: false, error: texteErreur(erreur) };
			}
			if (trace.ok) {
				resultat.lacunes++;
				resultat.consignes++;
				continue;
			}
			// Aucun abandon : chaque entrée non tracée porte son propre message,
			// y compris le refus de la lacune, et le paquet va jusqu'à son terme.
			resultat.erreurs.push(
				`${entry.kind} ${entry.subject} — ${erreur} (lacune non écrite : ${trace.error ?? "erreur inconnue"})`,
			);
		}
	}
	return resultat;
}

/** Variante groupée sur le pool d'ingestion. Utile en fin de collecte. */
export async function consignerLot(entries: readonly JournalEntry[]): Promise<LotResultat> {
	return consignerLotAvec((sql, params) => ingestQuery(sql, params ? [...params] : undefined), entries);
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
