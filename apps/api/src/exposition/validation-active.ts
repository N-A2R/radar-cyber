/**
 * Validation active du décile d'exposition le plus risqué.
 *
 * Le classement et la criticité viennent de `exposition_service` (règle
 * `exposition_criticite` définie en migration). Ce module ne recopie ni IP ni
 * organisation : les candidats ne vivent qu'en mémoire le temps de la sonde
 * TCP, seules leurs métadonnées techniques sont inscrites en base.
 *
 * Un refus explicite réfute la mesure primaire : c'est un faux positif. Un
 * timeout est indéterminé (filtrage), il n'est ni une confirmation ni un faux
 * positif. Les deux sont conservés dans `exposition_validation_tentative`.
 */
import net from "node:net";
import { ingestQuery, withIngestTransaction } from "../db.js";

export const REGLE_VALIDATION_ACTIVE = "ctem-validation-active@1";
export const METHODE_VALIDATION = "tcp-connect@1";
/** 20 expositions validées, prélevées dans le dixième supérieur de l'inventaire. */
export const TOP_VALIDES = 20;
/** Budget borné de sondes : jamais de balayage de port en masse. */
export const BUDGET_CANDIDATS = 60;
export const DELAIS_SONDE_MS = [2_500, 5_000, 8_000] as const;
export const CONCURRENCE_SONDE = 5;

export type ResultatActive = "ouvert" | "refuse" | "timeout" | "erreur";

export type CandidatValidation = {
	id: number;
	ip: string;
	port: number;
	categorie: string;
	criticite: number;
	rang: number;
};

export type ReponseSonde = { resultat: ResultatActive; latenceMs: number };
export type SondeTcp = (ip: string, port: number, timeoutMs: number) => Promise<ReponseSonde>;

export type TentativeValidation = {
	candidat: CandidatValidation;
	resultat: ResultatActive;
	tentatives: number;
	latenceMs: number;
	discoveredAt: Date;
	tentativeAt: Date;
	validatedAt: Date | null;
	fauxPositif: boolean;
	preuve: string;
};

export type OptionsValidation = {
	sonde?: SondeTcp;
	candidats?: CandidatValidation[];
	discoveredAt?: Date;
	regleVersion?: string;
	cible?: number;
	budget?: number;
	concurrence?: number;
};

export type RapportValidation = {
	regle: string;
	candidats: number;
	tentatives: number;
	confirmees: number;
	refusees: number;
	indeterminees: number;
	tauxConfirmation: number;
	tauxFauxPositif: number;
};

/** Seule une connexion TCP ouverte transforme l'exposition théorique en fait validé. */
export function estConfirme(resultat: ResultatActive): boolean {
	return resultat === "ouvert";
}

/** Un refus explicite réfute la source ; un timeout ne prouve rien. */
export function estFauxPositif(resultat: ResultatActive): boolean {
	return resultat === "refuse";
}

/** Preuve auditable, volontairement sans adresse IP ni nom d'organisation. */
export function preuveSonde(candidat: CandidatValidation, tentative: Pick<TentativeValidation, "resultat" | "tentatives" | "latenceMs">): string {
	return `${METHODE_VALIDATION} port=${candidat.port} resultat=${tentative.resultat} tentatives=${tentative.tentatives} latence_ms=${tentative.latenceMs}`;
}

/** Sonde TCP bornée : une connexion, aucun octet applicatif envoyé. */
export const sondeTcp: SondeTcp = (ip, port, timeoutMs) => {
	const { promise, resolve } = Promise.withResolvers<ReponseSonde>();
	const debut = Date.now();
	const socket = net.createConnection({ host: ip, port });
	socket.setTimeout(timeoutMs);
	let termine = false;
	function finir(resultat: ResultatActive): void {
		if (termine) return;
		termine = true;
		resolve({ resultat, latenceMs: Date.now() - debut });
		socket.destroy();
	}
	socket.once("connect", () => finir("ouvert"));
	socket.once("timeout", () => finir("timeout"));
	socket.once("error", (erreur: NodeJS.ErrnoException) => {
		finir(erreur.code === "ECONNREFUSED" ? "refuse" : "erreur");
	});
	socket.once("close", () => finir("erreur"));
	return promise;
};

/**
 * Candidats du dixième supérieur, ordonnés par criticité décroissante.
 * `to_jsonb` tolère les bases où `epss_max`/`kev` ne sont pas encore colonnes
 * de l'inventaire : la criticité se dégrade alors vers celle du port.
 */
export async function lireCandidatsTopDecile(limit: number): Promise<CandidatValidation[]> {
	const { rows } = await ingestQuery<CandidatValidation>(`
		WITH notes AS (
			SELECT e.id, e.ip, e.port, e.category,
			       exposition_criticite(
			         e.category,
			         COALESCE((to_jsonb(e)->>'epss_max')::double precision, 0),
			         COALESCE((to_jsonb(e)->>'kev')::boolean, false)
			       ) AS criticite,
			       row_number() OVER (
			         ORDER BY exposition_criticite(
			           e.category,
			           COALESCE((to_jsonb(e)->>'epss_max')::double precision, 0),
			           COALESCE((to_jsonb(e)->>'kev')::boolean, false)
			         ) DESC, e.id
			       ) AS rang
			  FROM exposition_service e
			 WHERE e.source_url <> ''
			   AND e.consulted_at >= now() - interval '7 days'
		), decile AS (
			SELECT * FROM notes
			 WHERE rang <= GREATEST(1, ceil((SELECT count(*)::numeric FROM exposition_service) / 10)::int)
		)
		SELECT id, ip, port, category AS categorie, criticite, rang
		  FROM decile
		 ORDER BY rang
		 LIMIT $1`,
		[limit],
	);
	return rows;
}

/** Écrit l'instantané validé et le journal des tentatives dans une transaction. */
async function enregistrer(
	tentatives: TentativeValidation[],
	confirmees: TentativeValidation[],
	discoveredAt: Date,
	regleVersion: string,
): Promise<void> {
	await withIngestTransaction(async (client) => {
		await client.query("DELETE FROM exposure_validation_eval WHERE regle_version = $1", [regleVersion]);
		await client.query("DELETE FROM exposition_validation_tentative WHERE regle_version = $1", [regleVersion]);

		for (const t of tentatives) {
			await client.query(
				`INSERT INTO exposition_validation_tentative
				   (exposition_id, rang_candidat, categorie, port, criticite, tentatives,
				    resultat, faux_positif, discovered_at, tentative_at, validated_at,
				    methode, preuve, regle_version)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
				[t.candidat.id, t.candidat.rang, t.candidat.categorie, t.candidat.port,
					t.candidat.criticite, t.tentatives, t.resultat, t.fauxPositif,
					t.discoveredAt, t.tentativeAt, t.validatedAt, METHODE_VALIDATION,
					t.preuve, regleVersion],
			);
		}

		for (const [index, t] of confirmees.entries()) {
			await client.query(
				`INSERT INTO exposure_validation_eval
				   (exposition_id, rang, categorie, port, criticite, discovered_at,
				    tentative_at, validated_at, resultat, methode, latence_ms,
				    faux_positif, preuve, regle_version)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
				[t.candidat.id, index + 1, t.candidat.categorie, t.candidat.port,
					t.candidat.criticite, t.discoveredAt, t.tentativeAt, t.validatedAt,
					t.resultat, METHODE_VALIDATION, t.latenceMs, t.fauxPositif,
					t.preuve, regleVersion],
			);
		}
	});
}

/**
 * Sonde les candidats par criticité décroissante jusqu'à 20 confirmations.
 * Chaque candidat est tenté au plus trois fois, avec concurrence bornée.
 */
export async function validerTopDecile(options: OptionsValidation = {}): Promise<RapportValidation> {
	const sonde = options.sonde ?? sondeTcp;
	const cible = options.cible ?? TOP_VALIDES;
	const budget = options.budget ?? BUDGET_CANDIDATS;
	const concurrence = Math.max(1, options.concurrence ?? CONCURRENCE_SONDE);
	const discoveredAt = options.discoveredAt ?? new Date();
	const regleVersion = options.regleVersion ?? REGLE_VALIDATION_ACTIVE;
	const candidats = (options.candidats ?? await lireCandidatsTopDecile(budget)).slice(0, budget);

	const tentatives: TentativeValidation[] = [];
	let curseur = 0;

	async function travailleur(): Promise<void> {
		while (curseur < candidats.length
			&& tentatives.reduce((n, t) => n + (t.resultat === "ouvert" ? 1 : 0), 0) < cible) {
			const candidat = candidats[curseur++];
			let resultat: ResultatActive = "timeout";
			let latenceMs = 0;
			let nombre = 0;
			for (const delai of DELAIS_SONDE_MS) {
				nombre += 1;
				const reponse = await sonde(candidat.ip, candidat.port, delai);
				resultat = reponse.resultat;
				latenceMs = reponse.latenceMs;
				if (resultat === "ouvert" || resultat === "refuse") break;
			}
			const fin = new Date();
			const tentative: TentativeValidation = {
				candidat,
				resultat,
				tentatives: nombre,
				latenceMs,
				discoveredAt,
				tentativeAt: fin,
				validatedAt: estConfirme(resultat) ? fin : null,
				fauxPositif: estFauxPositif(resultat),
				preuve: preuveSonde(candidat, { resultat, tentatives: nombre, latenceMs }),
			};
			tentatives.push(tentative);
		}
	}

	await Promise.all(Array.from({ length: Math.min(concurrence, candidats.length) }, travailleur));
	tentatives.sort((a, b) => a.candidat.rang - b.candidat.rang);
	const retenues = tentatives.filter((t) => estConfirme(t.resultat)).slice(0, cible);
	await enregistrer(tentatives, retenues, discoveredAt, regleVersion);

	const refusees = tentatives.filter((t) => t.fauxPositif).length;
	return {
		regle: regleVersion,
		candidats: candidats.length,
		tentatives: tentatives.length,
		confirmees: retenues.length,
		refusees,
		indeterminees: tentatives.length - retenues.length - refusees,
		tauxConfirmation: retenues.length / cible,
		tauxFauxPositif: tentatives.length === 0 ? 0 : refusees / tentatives.length,
	};
}

export type CritereValidationActive = {
	ratio: number;
	lignes: number;
	validees: number;
};

/** Requête du juge, avec alias et compteurs pour le rapport. */
export async function lireCritereValidationActive(): Promise<CritereValidationActive> {
	const { rows } = await ingestQuery<{ ratio: number | null; lignes: number; validees: number }>(`
		SELECT count(*) FILTER (WHERE validated_at <= discovered_at + interval '24 hours')::float
		         / NULLIF(count(*), 0) AS ratio,
		       count(*)::int AS lignes,
		       count(*) FILTER (WHERE validated_at IS NOT NULL)::int AS validees
		  FROM exposure_validation_eval`);
	return {
		ratio: rows[0]?.ratio ?? 0,
		lignes: rows[0]?.lignes ?? 0,
		validees: rows[0]?.validees ?? 0,
	};
}

/** Taux de faux positifs mesuré sur toutes les sondes réellement effectuées. */
export async function lireTauxFauxPositif(): Promise<{ ratio: number; tentatives: number }> {
	const { rows } = await ingestQuery<{ ratio: number | null; tentatives: number }>(`
		SELECT count(*) FILTER (WHERE faux_positif)::float / NULLIF(count(*), 0) AS ratio,
		       count(*)::int AS tentatives
		  FROM exposition_validation_tentative`);
	return { ratio: rows[0]?.ratio ?? 0, tentatives: rows[0]?.tentatives ?? 0 };
}
