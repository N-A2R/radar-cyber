/**
 * Les trois agents CPU branchés sur la file de revue.
 *
 * Les détecteurs purs vivent dans `agent-*.ts` : ils ne connaissent ni la base,
 * ni l'horloge, ni la revue. Ce module fait le seul travail d'adaptation qui
 * compte : lire les faits nécessaires à un instant donné, appeler les mêmes
 * détecteurs que les tests et la mesure, puis écrire une ligne d'alerte par
 * situation dans la file de revue (`scope = agents-cpu`), jamais dans la
 * diffusion.
 *
 * Trois points de contrat :
 *   - `maintenant` atteint le SQL : le rejeu historique regarde la fenêtre de
 *     l'instant demandé, pas la semaine courante ;
 *   - une situation qui dure met à jour l'evidence au lieu d'empiler des
 *     doublons (clé stable dans `evidence->>'cle'`, migration 049) ;
 *   - une alerte déjà traitée par un analyste n'est jamais rouverte : le
 *     statut n'est pas touché ici, et chaque écriture est journalisée.
 */
import { ingestQuery, query } from "../db.js";
import { consignerLot, type JournalEntry } from "../journal/index.js";
import { ALERT_SCOPE_AGENTS_CPU } from "../alert-scope.js";
import {
	AGENT_ORGANISATION_SURGISSANTE,
	FENETRE_ABSENCE_JOURS,
	FENETRE_RECENTE_JOURS as JOURS_ORG,
	detecterRupturesOrg,
} from "./agent-rupture-org.js";
import {
	AGENT_BASCULE_SECTEUR,
	FENETRE_RECENTE_JOURS as JOURS_SECTEUR,
	FENETRE_REFERENCE_JOURS,
	detecterRuptureSecteur,
	repartirEnFenetres,
} from "./agent-rupture-secteur.js";
import {
	AGENT_SOURCE_MUETTE,
	SEUIL_SILENCE_JOURS,
	detecterSourcesMuettes,
	type SourceSurveillee,
} from "./agent-source-muette.js";

const JOUR_MS = 86_400_000;

export const AGENTS_CPU = [
	AGENT_ORGANISATION_SURGISSANTE,
	AGENT_BASCULE_SECTEUR,
	AGENT_SOURCE_MUETTE,
] as const;

/** Alerte uniforme, prête pour la revue ; le détail reste dans `evidence`. */
export type AlerteAgentCpu = {
	agent: (typeof AGENTS_CPU)[number];
	/** Clé de déduplication stable, indépendante de l'horloge. */
	cle: string;
	titre: string;
	score: number;
	severity: number;
	orgId: number | null;
	faits: number[];
	explication: string;
	evidence: Record<string, unknown>;
};

/** score ∈ [0,1] → sévérité 1..5, sur la même échelle que les règles de détection. */
export function severiteDeScore(score: number): number {
	return Math.min(5, Math.max(1, Math.round(score * 4) + 1));
}

function idsFinis(valeurs: readonly unknown[]): number[] {
	return valeurs
		.map((v) => Number(v))
		.filter((n) => Number.isSafeInteger(n) && n > 0);
}

function alerte(
	agent: (typeof AGENTS_CPU)[number],
	cle: string,
	motif: string,
	score: number,
	orgId: number | null,
	faits: number[],
	explication: string,
	evidence: Record<string, unknown>,
): AlerteAgentCpu {
	return {
		agent,
		cle,
		titre: `${agent} — ${motif}`,
		score,
		severity: severiteDeScore(score),
		orgId,
		faits,
		explication,
		evidence: { ...evidence, agent, cle, motif, score, explication, faits },
	};
}

/**
 * Détecte les trois ruptures sur la base courante, à un instant donné.
 *
 * Sur une base sans fait dans les fenêtres, chaque détecteur rend une liste
 * vide : ce n'est pas « aucune rupture », c'est « rien à observer ». Le mesureur
 * distingue ces deux cas dans son rapport.
 */
export async function detecterAgentsCpuDepuisBase(
	maintenant: number = Date.now(),
): Promise<AlerteAgentCpu[]> {
	if (!Number.isFinite(maintenant)) {
		throw new RangeError("instant de rejeu invalide : maintenant doit être un timestamp fini");
	}
	const fin = new Date(maintenant).toISOString();
	const debut97 = new Date(maintenant - (JOURS_SECTEUR + FENETRE_REFERENCE_JOURS) * JOUR_MS).toISOString();
	const alertes: AlerteAgentCpu[] = [];

	// 1. Organisation déjà vue puis surgissante. Le détecteur pur trie les
	//    trois zones : fait ancien (preuve d'histoire), silence de 90 j,
	//    réapparition corroborée par plusieurs sources. Aucune borne basse sur
	//    les dates : un fait ancien peut être très loin dans le passé, et il
	//    n'y a que 109 événements rattachés à une organisation dans la base.
	const evenementsOrg = await query<{ id: string; orgId: number; date: string; sourceId: string }>(
		`SELECT e.id::text AS id, e.org_id AS "orgId", e.observed_at::text AS date,
		        e.source_id AS "sourceId"
		   FROM event e
		  WHERE e.org_id IS NOT NULL
		    AND e.observed_at <= $1::timestamptz`,
		[fin],
	);
	for (const a of detecterRupturesOrg(
		evenementsOrg.rows.map((e) => ({
			id: e.id,
			orgId: Number(e.orgId),
			date: e.date,
			sourceId: e.sourceId,
		})),
		maintenant,
	)) {
		const faits = idsFinis(a.evenementsDeclencheurs.map((e) => e.id));
		const n = a.evenementsDeclencheurs.length;
		alertes.push(alerte(
			AGENT_ORGANISATION_SURGISSANTE,
			`${AGENT_ORGANISATION_SURGISSANTE}:${a.orgId}`,
			`${n} apparitions en ${JOURS_ORG} j après ${FENETRE_ABSENCE_JOURS} j d'absence (${a.sourcesDistinctes} sources, ${a.evenementsAnciens} faits antérieurs)`,
			Math.min(1, n / 5),
			a.orgId,
			faits,
			`organisation ${a.orgId} : ${n} faits récents sur ${a.sourcesDistinctes} sources, aucun sur les ${FENETRE_ABSENCE_JOURS} j précédents, ${a.evenementsAnciens} fait(s) antérieur(s)`,
			{
				orgId: a.orgId,
				apparitions: n,
				sourcesDistinctes: a.sourcesDistinctes,
				evenementsAnciens: a.evenementsAnciens,
			},
		));
	}

	// 2. Bascule de secteur. Le secteur déclaré par le référentiel est pris tel
	//    quel ; à défaut, le type d'organisation est utilisé comme secteur
	//    grossier. Les deux niveaux sont documentés dans la fiche de mesure.
	const evenementsSecteur = await query<{ id: string; secteur: string; date: string }>(
		`SELECT e.id::text AS id,
		        COALESCE(NULLIF(btrim(o.sector), ''), NULLIF(btrim(o.kind), ''), 'inconnu') AS secteur,
		        e.observed_at::text AS date
		   FROM event e JOIN org o ON o.id = e.org_id
		  WHERE e.observed_at >= $1::timestamptz
		    AND e.observed_at <= $2::timestamptz`,
		[debut97, fin],
	);
	const lignesSecteur = evenementsSecteur.rows.map((e) => ({
		id: e.id,
		secteur: e.secteur,
		date: e.date,
	}));
	const fenetres = repartirEnFenetres(lignesSecteur, maintenant);
	const bascule = detecterRuptureSecteur({ recente: fenetres.recente, reference: fenetres.reference });
	if (bascule.alerte && bascule.secteurCritique !== null && bascule.zCritique !== null) {
		const limite = maintenant - JOURS_SECTEUR * JOUR_MS;
		const faits = idsFinis(
			lignesSecteur
				.filter((e) => e.secteur === bascule.secteurCritique && Date.parse(e.date) >= limite)
				.map((e) => e.id),
		);
		alertes.push(alerte(
			AGENT_BASCULE_SECTEUR,
			`${AGENT_BASCULE_SECTEUR}:${bascule.secteurCritique}`,
			`bascule du secteur ${bascule.secteurCritique} (z=${bascule.zCritique.toFixed(1)})`,
			Math.min(1, Math.abs(bascule.zCritique) / 6),
			null,
			faits,
			`${bascule.effectifs.recent} faits récents contre ${bascule.effectifs.reference} en référence ; z ${bascule.zCritique.toFixed(1)}`,
			{
				secteur: bascule.secteurCritique,
				z: bascule.zCritique,
				seuil: bascule.seuil,
				effectifs: bascule.effectifs,
				parSecteur: bascule.parSecteur.slice(0, 5),
			},
		));
	}

	// 3. Source quotidienne devenue muette. Seules les sources actives sont
	//    surveillées : une source désactivée intentionnellement n'est pas une
	//    rupture, et la condamner sur son silence est un faux positif garanti.
	const debutCadence = new Date(
		maintenant - (7 + SEUIL_SILENCE_JOURS) * JOUR_MS,
	).toISOString();
	const evenementsSource = await query<{
		id: string;
		sourceId: string;
		date: string;
	}>(
		`SELECT e.id::text AS id, e.source_id AS "sourceId", e.observed_at::text AS date
		   FROM event e JOIN source s ON s.id = e.source_id
		  WHERE s.enabled
		    AND e.observed_at >= $1::timestamptz
		    AND e.observed_at <= $2::timestamptz`,
		[debutCadence, fin],
	);
	const parSource = new Map<string, SourceSurveillee>();
	for (const e of evenementsSource.rows) {
		const source = parSource.get(e.sourceId) ?? { id: e.sourceId, evenements: [] };
		source.evenements.push({ id: Number(e.id), date: e.date });
		parSource.set(e.sourceId, source);
	}
	for (const a of detecterSourcesMuettes([...parSource.values()], maintenant)) {
		alertes.push(alerte(
			AGENT_SOURCE_MUETTE,
			`${AGENT_SOURCE_MUETTE}:${a.sourceId}`,
			a.motif,
			Math.min(1, a.silenceJours / (2 * SEUIL_SILENCE_JOURS)),
			null,
			idsFinis(a.faitsCadence),
			a.explication,
			{
				sourceId: a.sourceId,
				silenceJours: a.silenceJours,
				evenementsCadence: a.evenementsCadence,
			},
		));
	}

	return alertes.sort((a, b) => a.agent.localeCompare(b.agent) || a.cle.localeCompare(b.cle));
}

export type ResultatAgentsCpu = {
	/** Alertes détectées à ce passage. */
	emises: number;
	/** Lignes de revue créées. */
	creees: number;
	/** Lignes existantes mises à jour (evidence, sévérité). */
	misesAJour: number;
	/** Faits `alert.changed` consignés. */
	journal: number;
	/** Faits restés sans trace ou remplacés par une lacune. */
	lacunes: number;
};

/**
 * Persiste les alertes des trois agents dans la file de revue.
 *
 * L'unicité porte sur `(agent, clé)` via `evidence->>'cle'`, pas sur
 * `(règle, organisation)` : une bascule sectorielle et une source muette n'ont
 * pas d'organisation. Le journal est écrit après l'alerte, hors transaction :
 * une lacune de journal ne doit pas perdre une alerte de revue.
 */
export async function capterAgentsCpu(maintenant: number = Date.now()): Promise<ResultatAgentsCpu> {
	const alertes = await detecterAgentsCpuDepuisBase(maintenant);
	const faits: JournalEntry[] = [];
	let creees = 0;
	let misesAJour = 0;

	for (const a of alertes) {
		const ins = await ingestQuery<{ id: number; nouveau: boolean }>(
			`INSERT INTO alert (rule_id, title, severity, org_id, evidence, scope)
			 VALUES ($1, $2, $3, $4, $5, $6)
			 ON CONFLICT (rule_id, (evidence->>'cle'))
			   WHERE scope = $6 AND evidence ? 'cle' DO UPDATE
			   SET evidence = EXCLUDED.evidence,
			       severity = EXCLUDED.severity,
			       updated_at = now()
			 RETURNING id, (xmax = 0) AS nouveau`,
			[
				`agents-cpu:${a.agent}`,
				a.titre,
				a.severity,
				a.orgId,
				JSON.stringify(a.evidence),
				ALERT_SCOPE_AGENTS_CPU,
			],
		);
		const ligne = ins.rows[0];
		if (!ligne) continue;
		if (ligne.nouveau) creees++;
		else misesAJour++;
		faits.push({
			kind: "alert.changed",
			subject: `alert:agents-cpu:${a.cle}`,
			summary: `${a.agent} : alerte ${ligne.nouveau ? "créée" : "mise à jour"} — ${a.titre}`,
			actor: "moteur:agents-cpu@1",
			payload: {
				agent: a.agent,
				cle: a.cle,
				score: a.score,
				severity: a.severity,
				faits: a.faits,
				alerte: ligne.id,
			},
		});
	}

	const lot = await consignerLot(faits);
	return {
		emises: alertes.length,
		creees,
		misesAJour,
		journal: lot.consignes,
		lacunes: lot.lacunes + lot.erreurs.length,
	};
}
