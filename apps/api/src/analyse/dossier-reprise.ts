/**
 * Dossier de reprise — chantier 20.
 *
 * Un projet qui ne peut être repris que par celui qui l'a écrit n'est pas
 * livré. Ce module construit, à partir de l'état réel du système, le document
 * qu'un successeur lirait le premier jour : ce qui fonctionne, ce qui ne
 * fonctionne pas, ce qu'il faut savoir avant de toucher quoi que ce soit.
 *
 * Règle du dossier : **aucune phrase sans source**. Chaque affirmation est
 * adossée à une requête, un test, un fichier ou un chiffre, et ce qui n'est pas
 * mesuré est écrit « non mesuré » plutôt que supposé.
 */

export type SectionDossier = {
	cle: string;
	titre: string;
	points: string[];
};

export type Dossier = {
	genere: string;
	sections: SectionDossier[];
};

export type EtatSysteme = {
	organisations: number;
	sources: number;
	sourcesActives: number;
	sourcesMuettes: number;
	evenements: number;
	evenements30j: number;
	indicateurs: number;
	alertes: number;
	journalEvenements: number;
	archives: number;
	regles: number;
	migrations: number;
	derniereMigration: string | null;
	domainesConnus: number;
};

/** Ce que le dossier doit dire, dans l'ordre où un successeur le demande. */
export function construireDossier(etat: EtatSysteme, maintenant: string = new Date().toISOString()): Dossier {
	const sections: SectionDossier[] = [];

	sections.push({
		cle: "etat",
		titre: "Ce que contient le système aujourd'hui",
		points: [
			`${etat.organisations} organisations au référentiel, ${etat.domainesConnus} avec un domaine connu.`,
			`${etat.sources} sources déclarées, ${etat.sourcesActives} actives ; ${etat.sourcesMuettes} n'ont rien rendu sur les dernières 24 h.`,
			`${etat.evenements} événements en base, dont ${etat.evenements30j} sur 30 jours ; ${etat.indicateurs} indicateurs techniques.`,
			`${etat.alertes} alertes ouvertes, ${etat.journalEvenements} entrées de journal, ${etat.archives} événements archivés.`,
			`${etat.migrations} migrations appliquées ; la dernière est ${etat.derniereMigration ?? "inconnue"}.`,
		],
	});

	sections.push({
		cle: "verite",
		titre: "Ce que le système ne sait pas faire",
		points: [
			"Les événements ne sont pas dédupliqués en base : le regroupement par fait est une **lecture** (`analyse/corroboration.ts`), recalculée à chaque requête. Rien n'est fusionné — donc rien à défaire.",
			"L'unicité d'une source n'est pas une mesure de sa fiabilité : elle dit seulement qu'elle a parlé seule. Qu'elle ait eu raison demande un historique que la base de développement n'a pas.",
			"L'anticipation mesure ce qui précédait un fait dans nos données, pas ce qui l'a causé. Un taux bas est un résultat, pas une panne.",
			"Les sources sont collectées par HTTP sans navigateur : les sites qui exigent du JavaScript ne rendent rien, et ce n'est pas un bug de parseur.",
		],
	});

	sections.push({
		cle: "regles",
		titre: "Les règles qui ne se négocient pas",
		points: [
			"**Zéro euro** : aucune offre managée, aucun service facturé à l'appel. Une dépendance payante est un défaut de conception.",
			"**Rien n'est réécrit en base pour faire joli** : une lecture contestable se conteste en relisant le code, pas en restaurant une sauvegarde.",
			"**Non mesuré n'est pas zéro** : une valeur absente s'affiche « non mesuré », jamais `0` ni `—` déguisé en mesure.",
			"**Date de collecte ≠ date de l'incident** : le fil distingue `observé`, `déduit` et `collecté`, et le dit.",
			"**Une mesure se publie avec sa réserve** : sous 10 faits, un pourcentage est déclaré indicatif dans le code, pas dans une note de bas de page.",
		],
	});

	sections.push({
		cle: "gestes",
		titre: "Les cinq gestes du premier jour",
		points: [
			"`pnpm -w run verify` (ou `bash scripts/verify-all.sh`) : typecheck, tests API, rendu web, build, healthcheck. C'est le seul juge de « ça marche ».",
			"`tsx scripts/mesure-couverture.mts` : où en est la couverture régionale, par département et par secteur.",
			"`tsx scripts/diagnostic-sources.mts` : quelles sources sont muettes, et pourquoi (motif de rejet dominant).",
			"`tsx scripts/replay-journal.mts` : est-ce que la projection est d'accord avec le journal ? Sinon, il dit où.",
			"`tsx scripts/mesure-anticipation.mts` : ce qui précédait les faits. Sur une base vide, il le dit.",
		],
	});

	sections.push({
		cle: "pieges",
		titre: "Les pièges déjà payés",
		points: [
			"`fetch failed` dans un environnement filtré ne veut pas dire « source cassée » : vérifier avant de réécrire un collecteur.",
			"Trier par une colonne `null` place les absences en fin dans les deux sens — d'où les clés de tri explicites (`yield`, `unicite`).",
			"`Math.floor(n/2)` sur une liste triée rend la valeur haute d'un effectif pair : utiliser `analyse/mediane.ts`.",
			"`Math.max()` sur une liste vide vaut `-Infinity` : filtrer les valeurs renseignées et rendre `null`.",
			"`renderToStaticMarkup` échappe l'apostrophe en `&#x27;` : les vérifications de rendu doivent tester la forme échappée.",
			"Le journal est append-only par trigger : même un `DELETE` de test échoue. Isoler par sujet, jamais nettoyer par table.",
		],
	});

	return { genere: maintenant, sections };
}

/** Rendu markdown du dossier, prêt à être relu hors ligne. */
export function dossierEnMarkdown(dossier: Dossier): string {
	const lignes = [
		"# Dossier de reprise",
		"",
		`> Généré le ${dossier.genere} à partir de l'état réel du système.`,
		"> Chaque chiffre vient d'une requête ; ce qui n'est pas mesuré est écrit « non mesuré ».",
		"",
	];
	for (const section of dossier.sections) {
		lignes.push(`## ${section.titre}`, "");
		for (const point of section.points) lignes.push(`- ${point}`);
		lignes.push("");
	}
	return `${lignes.join("\n")}\n`;
}
