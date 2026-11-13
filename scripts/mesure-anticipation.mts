/**
 * Anticipation mesurée — chantier 11.
 *
 * La question : ce qui a été revendiqué, puis confirmé, était-il annoncé avant ?
 * Et surtout : par quoi ? Ce script ne fabrique pas d'anticipation ; il
 * **regarde si elle existait** dans les données qu'on avait déjà.
 *
 * Méthode, sans modèle et sans réseau :
 *
 *  1. une organisation touchée a des événements ; on prend le premier d'une
 *     famille donnée comme « fait principal » ;
 *  2. on regarde **ce qui la concernait dans les 21 jours précédents** : une
 *     autre famille, un indicateur technique, une alerte, un signal de presse ;
 *  3. on classe le signal en quatre natures — *indicateur* (actif découvert),
 *     *revendication antérieure*, *signal d'ambiance*, *alerte* ;
 *  4. on publie le taux : part des faits qui avaient au moins un signal avant.
 *
 * Le résultat a le droit d'être « rien ». Un chiffre bas n'est pas un échec du
 * script, c'est la mesure d'une capacité qu'on n'a pas encore — et c'est
 * exactement ce qu'un projet doit savoir avant de promettre de l'anticipation.
 *
 *   tsx scripts/mesure-anticipation.mts
 *   tsx scripts/mesure-anticipation.mts --json=bench/results/anticipation.json
 *   tsx scripts/mesure-anticipation.mts --jours=30
 *
 * Lecture seule.
 */
import { writeFileSync } from "node:fs";
import { closePools, query } from "../apps/api/src/db.js";
import {
	classerSignal,
	resumerAnticipation,
	SEUIL_INDICATIF,
	type SignalAnticipation,
} from "../apps/api/src/analyse/anticipation.js";

/** Fenêtre d'avance par défaut : trois semaines. */
const JOURS_DEFAUT = 21;

type Fait = {
	org_id: number;
	org_name: string;
	family: string;
	premier: string;
	titre: string;
};

type Signal = {
	nature: "indicateur" | "revendication" | "ambiance" | "alerte";
	family: string;
	source_id: string;
	date: string;
	avance_jours: number;
	resume: string;
};

async function main(): Promise<void> {
	const jours = Number(process.argv.find((a) => a.startsWith("--jours="))?.split("=")[1] ?? JOURS_DEFAUT);

	// « Faits principaux » : pour chaque organisation et chaque famille, le
	// premier événement d'une série. C'est ce qu'on aurait voulu voir venir.
	const { rows: faits } = await query<Fait>(
		`WITH premiers AS (
		   SELECT DISTINCT ON (e.org_id, e.family)
		          e.org_id, e.family, e.title AS titre,
		          COALESCE(e.observed_at, e.collected_at) AS premier
		     FROM event e
		    WHERE e.org_id IS NOT NULL
		      AND COALESCE(e.observed_at, e.collected_at) >= now() - interval '365 days'
		    ORDER BY e.org_id, e.family, COALESCE(e.observed_at, e.collected_at) ASC
		 )
		 SELECT p.org_id, o.name AS org_name, p.family, p.premier::text AS premier, p.titre
		   FROM premiers p JOIN org o ON o.id = p.org_id
		  ORDER BY p.premier DESC`,
	);

	const resultats: Array<{ fait: Fait; signaux: Signal[] }> = [];
	const pourResume: Array<{ signaux: SignalAnticipation[] }> = [];

	for (const fait of faits) {
		// Ce qui concernait cette organisation dans la fenêtre d'avance, avant
		// le fait, et qui n'en est pas une répétition.
		const { rows } = await query<Signal>(
			`SELECT CASE
			          WHEN e.assertion_type = 'technical_indicator' THEN 'indicateur'
			          WHEN e.assertion_type = 'third_party_claim' THEN 'revendication'
			          ELSE 'ambiance'
			        END AS nature,
			        e.family, e.source_id,
			        COALESCE(e.observed_at, e.collected_at)::text AS date,
			        ROUND(EXTRACT(EPOCH FROM ($3::timestamptz - COALESCE(e.observed_at, e.collected_at))) / 86400)::int AS avance_jours,
			        left(e.title, 120) AS resume
			   FROM event e
			  WHERE e.org_id = $1
			    AND COALESCE(e.observed_at, e.collected_at) < $3::timestamptz
			    AND COALESCE(e.observed_at, e.collected_at) >= $3::timestamptz - ($2 || ' days')::interval
			  ORDER BY COALESCE(e.observed_at, e.collected_at) DESC`,
			[fait.org_id, String(jours), fait.premier],
		);

		// Les alertes sont un signal à part : quelqu'un (ou une règle) avait
		// déjà jugé le sujet digne d'attention.
		const { rows: alertes } = await query<Signal>(
			`SELECT 'alerte' AS nature, e.family, 'alerte' AS source_id,
			        a.created_at::text AS date,
			        ROUND(EXTRACT(EPOCH FROM ($2::timestamptz - a.created_at)) / 86400)::int AS avance_jours,
			        left(a.title, 120) AS resume
			   FROM alert a JOIN event e ON e.id = a.event_id
			  WHERE a.org_id = $1
			    AND a.created_at < $2::timestamptz
			    AND a.created_at >= $2::timestamptz - ($3 || ' days')::interval`,
			[fait.org_id, fait.premier, String(jours)],
		);

		const signaux = [...rows, ...alertes];
		resultats.push({ fait, signaux });
		pourResume.push({
			signaux: signaux.map((s) => ({
				// `rows` porte déjà une nature calculée en SQL ; `alertes` aussi.
				nature: classerSignal({
					assertionType: s.nature === "revendication" ? "third_party_claim" : s.nature === "indicateur" ? "technical_indicator" : "ambient_signal",
					kind: s.nature === "alerte" ? "alerte" : "event",
				}),
				family: s.family,
				sourceId: s.source_id,
				avanceJours: s.avance_jours,
				resume: s.resume,
			})),
		});
	}

	const resume = resumerAnticipation(pourResume);
	const avecSignal = resultats.filter((r) => r.signaux.length > 0);

	console.log(`Anticipation mesurée — fenêtre d'avance ${jours} jours — ${new Date().toISOString().slice(0, 10)}`);
	console.log(`${resultats.length} fait(s) principal(aux) examiné(s)\n`);
	if (resultats.length === 0) {
		console.log("Aucun fait rattaché à une organisation sur les 365 derniers jours.");
		console.log("La mesure est vide, pas nulle : la base de développement ne contient pas de série.");
	} else {
		console.log(
			`Faits précédés d'au moins un signal : ${resume.avecSignal}/${resume.faits} (${resume.partPct} %)`,
		);
		console.log(
			`Avance médiane : ${resume.avanceMedianeJours === null ? "—" : `${resume.avanceMedianeJours} jour(s)`}`,
		);
		console.log("\nPar nature de signal :");
		for (const [nature, n] of Object.entries(resume.parNature).sort((a, b) => b[1] - a[1])) {
			console.log(`  ${nature.padEnd(14)} ${String(n).padStart(4)} fait(s)`);
		}
		if (resume.indicative) {
			console.log(
				`\nRéserve : ${resume.faits} fait(s) seulement. En dessous de ${SEUIL_INDICATIF}, un pourcentage dit une tendance, pas une capacité.`,
			);
		}
		if (avecSignal.length > 0) {
			console.log("\nExemples :");
			for (const r of avecSignal.slice(0, 8)) {
				const premier = r.signaux[r.signaux.length - 1];
				console.log(
					`  ${r.fait.org_name.slice(0, 28).padEnd(30)} ${r.fait.family.padEnd(11)} ← ${premier?.nature} ${premier?.avance_jours} j avant`,
				);
			}
		}
		console.log(
			"\nLecture : un taux bas n'est pas une erreur de mesure, c'est la capacité d'anticipation réelle du corpus. La publier vaut mieux que promettre.",
		);
	}

	const fichier = process.argv.find((a) => a.startsWith("--json="))?.split("=")[1];
	if (fichier) {
		writeFileSync(
			fichier,
			`${JSON.stringify(
				{
					date: new Date().toISOString().slice(0, 10),
					fenetreAvanceJours: jours,
					...resume,
					details: avecSignal.map((r) => ({
						org: r.fait.org_name,
						family: r.fait.family,
						fait: r.fait.premier,
						signaux: r.signaux,
					})),
				},
				null,
				2,
			)}\n`,
			"utf8",
		);
		console.log(`\nmesure publiée : ${fichier}`);
	}
	await closePools();
}

main().catch(async (error: unknown) => {
	console.error(error);
	await closePools().catch(() => {});
	process.exitCode = 1;
});
