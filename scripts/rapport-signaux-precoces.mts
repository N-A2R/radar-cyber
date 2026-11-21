/**
 * Rapport « signaux précoces » — mesure avant/après par piste sur 100 incidents.
 * Sans base ni réseau : les signaux et les disponibilités sont versionnés.
 *
 *   apps/api/node_modules/.bin/tsx scripts/rapport-signaux-precoces.mts
 *   apps/api/node_modules/.bin/tsx scripts/rapport-signaux-precoces.mts --verifier
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
	construireIncidents,
	type IncidentDepartemental,
} from "../apps/api/src/analyse/benchmark-premier-regard.js";
import {
	mesurerSignauxPrecoces,
	PISTES,
	type LigneSignaux,
	type MesureSignaux,
	type SignalPrecoce,
} from "../apps/api/src/analyse/signaux-precoces.js";

const racine = fileURLToPath(new URL("../", import.meta.url));
const verifier = process.argv.includes("--verifier");

const NOMS_PISTE: Record<(typeof PISTES)[number], string> = {
	ct: "CT (crt.sh)",
	revendication: "Revendication (ransomware.live, Socradar)",
	fuites: "Fuites (FrenchBreaches, HIBP)",
	dns: "DNS (changements)",
};

function lireJsonl(chemin: string): Record<string, unknown>[] {
	return readFileSync(chemin, "utf8")
		.split("\n")
		.filter((ligne) => ligne.trim().length > 0)
		.map((ligne) => JSON.parse(ligne) as Record<string, unknown>);
}

function lireEntrees(): { mesure: MesureSignaux; disponibilite: unknown } {
	const reference = JSON.parse(
		readFileSync(`${racine}bench/fixtures/corpus-reference-na.json`, "utf8"),
	) as Parameters<typeof construireIncidents>[0];
	const departementaux = readdirSync(`${racine}bench/corpus`)
		.filter((nom) => /^incidents-.*\.jsonl$/.test(nom))
		.sort()
		.flatMap((nom) => lireJsonl(`${racine}bench/corpus/${nom}`) as IncidentDepartemental[]);
	const incidents = construireIncidents(reference, departementaux, 100);
	const signaux = lireJsonl(`${racine}bench/corpus/signaux-precoces.jsonl`) as unknown as SignalPrecoce[];
	const disponibilite = JSON.parse(
		readFileSync(`${racine}bench/results/disponibilite-signaux.json`, "utf8"),
	) as unknown;
	return { mesure: mesurerSignauxPrecoces(incidents, signaux), disponibilite };
}

function nombre(valeur: number | null): string {
	if (valeur === null) return "—";
	return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(valeur);
}

function produireRapport(mesure: MesureSignaux): string {
	const lignes: string[] = [];
	const toutes = mesure.toutesPistes;
	const avecGainEtPresse = mesure.incidents.filter(
		(ligne) => ligne.datePresse !== null && ligne.meilleur !== null,
	).length;
	const meilleurIncident = mesure.incidents.reduce<LigneSignaux | null>(
		(meilleur, ligne) =>
			ligne.meilleur !== null &&
			(meilleur === null || ligne.meilleur.joursGagnes > (meilleur.meilleur?.joursGagnes ?? 0))
				? ligne
				: meilleur,
		null,
	);
	const gainMedianeH =
		mesure.avant.medianeH !== null && mesure.apres.medianeH !== null
			? mesure.avant.medianeH - mesure.apres.medianeH
			: null;

	lignes.push("# Signaux précoces — mesure avant/après par piste");
	lignes.push("");
	lignes.push(
		"Mesure 2026-11-21 sur les 100 incidents du benchmark (`docs/benchmark.md`). Un signal n'est retenu que s'il porte un incident du corpus, une date valide et une URL de sa piste : un article de presse reste la référence « avant », jamais un signal nouveau. Gain = `max(0, date radar − date du signal)` ; délai après = `min(radar, signal) − première date de presse`, sur les 77 incidents datés.",
	);
	lignes.push("");
	lignes.push("| Piste | Couverts | Jours gagnés (total) | Médiane sur couverts | Délai médian après |");
	lignes.push("| --- | ---: | ---: | ---: | ---: |");
	for (const piste of PISTES) {
		const bilan = mesure.parPiste[piste];
		lignes.push(
			`| ${NOMS_PISTE[piste]} | ${bilan.incidentsCouverts}/100 | ${nombre(bilan.joursGagnes.total)} | ${bilan.joursGagnes.medianeCouverts === null ? "—" : `${nombre(bilan.joursGagnes.medianeCouverts)} j`} | ${nombre(bilan.delaiApresH.mediane)} h |`,
		);
	}
	lignes.push(
		`| Toutes pistes | ${toutes.incidentsCouverts}/100 | ${nombre(toutes.joursGagnes.total)} | ${toutes.joursGagnes.medianeCouverts === null ? "—" : `${nombre(toutes.joursGagnes.medianeCouverts)} j`} | ${nombre(toutes.delaiApresH.mediane)} h |`,
	);
	lignes.push("");
	lignes.push(
		`Avant : délai médian ${nombre(mesure.avant.medianeH)} h, ${mesure.avant.n} incidents datés. Après : ${nombre(mesure.apres.medianeH)} h, ${mesure.apres.n} incidents datés.`,
	);
	lignes.push("");
	if (mesure.pisteDominante === null) {
		lignes.push("**Aucune piste ne gagne de jour** : aucun signal rattaché au corpus.");
	} else {
		const gagnant = mesure.parPiste[mesure.pisteDominante];
		lignes.push(
			`**Piste qui apporte le plus de jours gagnés : ${NOMS_PISTE[mesure.pisteDominante]}** — ${nombre(gagnant.joursGagnes.total)} j cumulés sur ${gagnant.incidentsCouverts} incidents, ${nombre(gagnant.joursGagnes.medianeCouverts)} j médians, jusqu'à ${nombre(gagnant.joursGagnes.max)} j (${meilleurIncident?.entite ?? "incident non identifié"}). Les fuites ajoutent ${nombre(mesure.parPiste.fuites.joursGagnes.total)} j sur ${mesure.parPiste.fuites.incidentsCouverts} incidents. CT et DNS : 0 j, aucune observation rattachée aux 100 incidents.`,
		);
	}
	lignes.push("");
	if (gainMedianeH !== null && gainMedianeH > 0) {
		lignes.push(
			`**Médiane globale : ${nombre(mesure.avant.medianeH)} h → ${nombre(mesure.apres.medianeH)} h, soit ${nombre(gainMedianeH / 24)} jours gagnés.** Ce gain vient de la revendication. ${avecGainEtPresse} des ${mesure.avecPresse} incidents datés portent un signal ; les ${mesure.avecPresse - avecGainEtPresse} autres gardent leur délai d'origine. Le gain reste concentré sur ${toutes.incidentsAvecGain} incidents sur 100 (jusqu'à ${nombre(toutes.joursGagnes.max)} j).`,
		);
	} else {
		lignes.push(
			`**Aucune piste ne fait baisser la médiane globale** : ${nombre(mesure.avant.medianeH)} h avant comme après. ${mesure.avecPresse - avecGainEtPresse} des ${mesure.avecPresse} incidents datés n'ont aucun signal avec gain. Le gain est réel pour ${toutes.incidentsAvecGain} incidents (jusqu'à ${nombre(toutes.joursGagnes.max)} j), pas pour la distribution.`,
		);
	}
	lignes.push("");
	lignes.push(
		"Limites : dates de revendication et de fuite relevées rétrospectivement le 21 novembre 2026 ; elles prouvent qu'un signal public existait, pas qu'un collecteur l'a vu ce jour-là. Aucune donnée volée n'est collectée. Disponibilités vérifiées : `bench/results/disponibilite-signaux.json` ; rejouer avec `apps/api/node_modules/.bin/tsx scripts/rapport-signaux-precoces.mts --verifier`.",
	);
	lignes.push("");
	return lignes.join("\n");
}

function produireResultats(mesure: MesureSignaux, disponibilite: unknown): string {
	return `${JSON.stringify(
		{
			dateMesure: "2026-11-21",
			methode:
				"Gain = max(0, radar − signal) ; délai après = min(radar, signal) − presse, sur les incidents avec date de presse. Presse = référence avant, jamais un signal.",
			avant: mesure.avant,
			apres: mesure.apres,
			parPiste: mesure.parPiste,
			toutesPistes: mesure.toutesPistes,
			pisteDominante: mesure.pisteDominante,
			disponibilite,
			incidents: mesure.incidents.map((ligne) => ({
				id: ligne.id,
				entite: ligne.entite,
				dateRadar: ligne.dateRadar,
				datePresse: ligne.datePresse,
				meilleur: ligne.meilleur,
				delaiApresToutesPistesH: ligne.delaiApresToutesPistesH,
			})),
		},
		null,
		2,
	)}\n`;
}

function ecrireOuVerifier(chemin: string, contenu: string): void {
	if (verifier) {
		if (readFileSync(chemin, "utf8") !== contenu) {
			console.error(`${chemin} : le document ne correspond plus à ses entrées ; le régénérer.`);
			process.exitCode = 1;
		}
		return;
	}
	writeFileSync(chemin, contenu, "utf8");
}

const { mesure, disponibilite } = lireEntrees();
ecrireOuVerifier(`${racine}docs/signaux-precoces.md`, produireRapport(mesure));
ecrireOuVerifier(
	`${racine}bench/results/signaux-precoces.json`,
	produireResultats(mesure, disponibilite),
);
if (verifier) {
	console.log(`signaux précoces : 2 documents conformes (${mesure.total} incidents)`);
} else {
	console.log(
		`${mesure.total} incidents → mediane ${mesure.avant.medianeH} h avant / ${mesure.apres.medianeH} h après ; piste dominante ${mesure.pisteDominante}`,
	);
}
