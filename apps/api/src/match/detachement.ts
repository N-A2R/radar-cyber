/**
 * Retrait d'un rattachement, avec recalcul de la portée régionale.
 *
 * Plusieurs chemins défont un lien (`repair-rattachements`,
 * `measure-attachment-coherence`, `reconcile-orgs`, certification SIREN). Tous
 * écrivaient `org_id = NULL` en laissant `regional = true` et
 * `regional_motif = 'rattachement'` : le fil continuait de présenter comme
 * régional un fait dont la seule preuve territoriale venait d'un lien défait.
 * Mesuré le 2026-11-24 : 23 événements sur 51 « régionaux sans org » étaient
 * dans ce cas, dont 20 revendications sans aucun département cité.
 *
 * Seul le motif `rattachement` est recalculé, avec `porteeRegionale(texte,
 * null)` — la même fonction que l'ingestion. Les motifs `departement` et
 * `nouvelle-aquitaine` viennent de la source et sont conservés. Aucun
 * rattachement de remplacement n'est proposé.
 * Le lien défait et l'avant/après sont écrits au journal ; la preuve
 * (`event.evidence`) n'est pas modifiée.
 */
import type { PoolClient } from "pg";
import { porteeRegionale } from "./territorial.js";

type ClientSQL = Pick<PoolClient, "query">;

export interface DetachementInput {
	eventId: number | string;
	/** Organisation que le lien devait porter : un écart annule l'opération. */
	orgId: number;
	/** Motif humain du retrait, consigné au journal. */
	motif: string;
	regle: string;
	journal: {
		kind: string;
		actor: string;
		summary: string;
		/** Par défaut `event:<id>` ; les scripts historiques utilisent le dedup_key. */
		subject?: string;
		payload?: Record<string, unknown>;
	};
}

export type ResultatDetachement = {
	updated: boolean;
	avant: { regional: boolean; motif: string | null };
	apres: { regional: boolean; motif: string };
};

type Ligne = {
	dedup_key: string;
	title: string | null;
	summary: string | null;
	org_id: number | null;
	regional: boolean;
	regional_motif: string | null;
};

/**
 * À appeler dans une transaction. Rend `updated: false` si le lien a déjà
 * changé : deux réparations concurrentes ne doivent pas s'écraser.
 */
export async function defaireRattachement(
	client: ClientSQL,
	input: DetachementInput,
): Promise<ResultatDetachement> {
	const { rows } = await client.query<Ligne>(
		`SELECT dedup_key, title, summary, org_id, regional, regional_motif
		   FROM event WHERE id = $1 FOR UPDATE`,
		[input.eventId],
	);
	const ligne = rows[0];
	const avant = {
		regional: ligne?.regional ?? false,
		motif: ligne?.regional_motif ?? null,
	};
	if (!ligne || ligne.org_id !== input.orgId) {
		return { updated: false, avant, apres: { regional: avant.regional, motif: avant.motif ?? "aucun" } };
	}

	// Seul le motif issu du rattachement doit être recalculé. Un motif
	// `departement` ou `nouvelle-aquitaine` vient de la source / du texte
	// éditorial et reste vrai même quand le lien tombe.
	const recalcule = ligne.regional_motif === "rattachement"
		? porteeRegionale(`${ligne.title ?? ""} ${ligne.summary ?? ""}`, null)
		: { regional: ligne.regional, motif: ligne.regional_motif ?? "aucun" };
	const apres = { regional: recalcule.regional, motif: recalcule.motif };
	await client.query(
		`UPDATE event SET org_id = NULL, regional = $2, regional_motif = $3 WHERE id = $1`,
		[input.eventId, apres.regional, apres.motif],
	);
	await client.query(
		`INSERT INTO journal (kind, subject, summary, payload, actor, valid_at)
		 VALUES ($1, $2, $3, $4::jsonb, $5, now())`,
		[
			input.journal.kind,
			input.journal.subject ?? `event:${input.eventId}`,
			input.journal.summary,
			JSON.stringify({
				...(input.journal.payload ?? {}),
				eventId: Number(input.eventId),
				orgId: null,
				orgRetiree: input.orgId,
				motif: input.motif,
				regle: input.regle,
				porteeAvant: avant,
				porteeApres: { regional: apres.regional, motif: apres.motif },
			}),
			input.journal.actor,
		],
	);
	return { updated: true, avant, apres: { regional: apres.regional, motif: apres.motif } };
}
