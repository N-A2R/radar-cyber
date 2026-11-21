#!/usr/bin/env -S npx tsx
/**
 * Reconstruit la table `campaign` depuis les événements réels.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/build-campagnes.mts
 *
 * `--dry-run` calcule le rapport sans écrire. Le passage normal remplace
 * atomiquement le contenu de la table : une campagne obsolète ne reste pas
 * affichée comme si elle était encore détectée.
 */
import { closePools, query } from "../apps/api/src/db.js";
import {
	analyserCampagnes,
	enregistrerCampagnes,
	type EvenementCampagne,
} from "../apps/api/src/analyse/campagnes.js";

type Ligne = {
	id: number;
	family: string;
	title: string;
	observed_at: Date | string | null;
	source_id: string;
	source_url: string | null;
	org_id: number | null;
	sector: string | null;
	evidence: unknown;
};

async function principal(): Promise<void> {
	const resultat = await query<Ligne>(
		`SELECT e.id, e.family, e.title, e.observed_at, e.source_id, e.source_url,
		        e.org_id, o.sector, e.evidence
		   FROM event e LEFT JOIN org o ON o.id = e.org_id
		  ORDER BY e.observed_at NULLS LAST, e.id`,
	);
	const evenements: EvenementCampagne[] = resultat.rows.map((ligne) => ({
		id: Number(ligne.id),
		family: ligne.family,
		title: ligne.title,
		observedAt:
			ligne.observed_at instanceof Date ? ligne.observed_at.toISOString() : ligne.observed_at,
		sourceId: ligne.source_id,
		sourceUrl: ligne.source_url,
		orgId: ligne.org_id === null ? null : Number(ligne.org_id),
		sector: ligne.sector,
		evidence:
			typeof ligne.evidence === "object" && ligne.evidence !== null && !Array.isArray(ligne.evidence)
				? (ligne.evidence as Record<string, unknown>)
				: {},
	}));

	const analyse = analyserCampagnes(evenements);
	const ecritures = process.argv.includes("--dry-run")
		? null
		: await enregistrerCampagnes(analyse.campagnes);
	console.log(
		JSON.stringify(
			{
				rapport: analyse.rapport,
				ecritures,
				exemples: analyse.campagnes.slice(0, 5).map((c) => ({
					label: c.label,
					taille: c.taille,
					confiance: c.confiance,
					sources: c.sourceIds,
				})),
			},
			null,
			2,
		),
	);
}

principal()
	.catch((erreur: unknown) => {
		console.error(erreur);
		process.exitCode = 1;
	})
	.finally(() => {
		void closePools();
	});
