/**
 * Inventaire des sous-domaines de Nouvelle-Aquitaine via les CT logs.
 *
 * Les domaines viennent des corpus officiels versionnés (communes vérifiées,
 * santé/enseignement, institutions) et des organisations du référentiel dont
 * le siège est en NA. Les noms sont ensuite cherchés dans crt.sh et Cert
 * Spotter ; les variantes à une lettre des domaines les plus sensibles sont
 * interrogées pour trouver des certificats look-alike.
 *
 * Usage :
 *   pnpm -F @radar/api exec tsx scripts/inventaire-ctlogs.mts --limite=50
 *   pnpm -F @radar/api exec tsx scripts/inventaire-ctlogs.mts --appliquer
 */
import { readFileSync, writeFileSync } from "node:fs";
import { ingestQuery, closePools } from "../apps/api/src/db.js";
import { ClientCT } from "../apps/api/src/ctlogs/client.js";
import {
	ciblesDepuisCorpus,
	ciblesDepuisOrg,
	detecterSuspects,
	extraireSousDomaines,
	fusionnerCibles,
	variantesTypo,
	type Cible,
	type LigneSite,
} from "../apps/api/src/ctlogs/inventaire.js";
import { construireRapport, enregistrerInventaire } from "../apps/api/src/ctlogs/stockage.js";

function option(nom: string, defaut: string): string {
	const prefixe = `--${nom}=`;
	const trouve = process.argv.find((argument) => argument.startsWith(prefixe));
	return trouve ? trouve.slice(prefixe.length) : defaut;
}

function lireCorpus(chemin: string): LigneSite[] {
	const texte = readFileSync(new URL(chemin, import.meta.url), "utf8");
	return texte
		.split(/\r?\n/)
		.filter((ligne) => ligne.trim() !== "")
		.map((ligne) => JSON.parse(ligne) as LigneSite);
}

/** Universités, hôpitaux et grandes communes d'abord : ce sont les plus exposés. */
function priorite(ligne: LigneSite): number {
	const type = (ligne.type ?? "").toLowerCase();
	if (/universit|hôpital|hopital|chu|centre hospitalier/.test(type)) return 3;
	if ((ligne.population ?? 0) >= 20_000) return 2;
	return 1;
}

function trierParPriorite(cibles: Cible[], corpus: LigneSite[]): Cible[] {
	const scores = new Map<string, number>();
	for (const ligne of corpus) {
		const url = ligne.url_finale ?? ligne.url;
		if (!url) continue;
		let meilleur: string | null = null;
		for (const cible of cibles) {
			if (!url.toLowerCase().includes(cible.domaine)) continue;
			if (!meilleur || cible.domaine.length > meilleur.length) meilleur = cible.domaine;
		}
		if (meilleur) scores.set(meilleur, Math.max(scores.get(meilleur) ?? 0, priorite(ligne)));
	}
	return [...cibles].sort((a, b) => {
		const diff = (scores.get(b.domaine) ?? 0) - (scores.get(a.domaine) ?? 0);
		return diff !== 0 ? diff : a.domaine.localeCompare(b.domaine);
	});
}

function pct(valeur: number, total: number): string {
	return total === 0 ? "—" : `${((100 * valeur) / total).toFixed(1)} %`;
}

async function main(): Promise<void> {
	const appliquer = process.argv.includes("--appliquer");
	const limite = Number(option("limite", "50"));
	const nombreVariantes = Number(option("variantes", "10"));
	const variantesParDomaine = Number(option("variantes-par-domaine", "2"));
	const joursRecents = Number(option("jours", "180"));
	const collecteLe = new Date().toISOString();
	const dateJour = collecteLe.slice(0, 10);

	const communes = lireCorpus("../bench/corpus/communes.jsonl");
	const sante = lireCorpus("../bench/corpus/sante-enseignement.jsonl");
	const institutions = lireCorpus("../bench/corpus/institutions.jsonl");
	const corpus = [...communes, ...sante, ...institutions];
	let cibles = fusionnerCibles(
		ciblesDepuisCorpus(communes, "corpus:communes"),
		ciblesDepuisCorpus(sante, "corpus:sante-enseignement"),
		ciblesDepuisCorpus(institutions, "corpus:institutions"),
	);
	if (process.env.RADAR_CT_SKIP_DB !== "1") {
		const orgs = await ingestQuery<{ name: string; domain: string | null; dept: string | null }>(
			"SELECT name, domain, dept FROM org WHERE domain IS NOT NULL AND btrim(domain) <> '' ORDER BY id",
		);
		cibles = fusionnerCibles(cibles, ciblesDepuisOrg(orgs.rows));
	}
	cibles = trierParPriorite(cibles, corpus);
	const retenues = cibles.slice(0, limite);

	const domainesCibles = new Set(retenues.map((c) => c.domaine));
	const variantes: string[] = [];
	for (const cible of retenues.slice(0, nombreVariantes)) {
		for (const variante of variantesTypo(cible.domaine, variantesParDomaine)) {
			if (!domainesCibles.has(variante) && !variantes.includes(variante)) variantes.push(variante);
		}
	}
	console.log(`Domaines NA retenus : ${retenues.length} (sur ${cibles.length} candidats)`);
	console.log(`Variantes look-alike interrogées : ${variantes.length}`);

	const client = new ClientCT({ utiliserCrtSh: option("crtsh", "on") !== "off" });
	const resultat = await client.interroger([...retenues.map((c) => c.domaine), ...variantes]);
	const sousDomaines = extraireSousDomaines(resultat.certificats, retenues);
	const comptes = new Map<string, number>();
	for (const ligne of sousDomaines) comptes.set(ligne.domaine, (comptes.get(ligne.domaine) ?? 0) + 1);
	const suspects = detecterSuspects(resultat.certificats, retenues, collecteLe, joursRecents).map((s) => ({
		...s,
		sous_domaines_observes: comptes.get(s.domaine) ?? 0,
	}));
	const rapport = construireRapport({
		collecteLe,
		domainesInterroges: retenues.length,
		sousDomaines: sousDomaines.length,
		suspects: suspects.length,
		variantesInterrogees: variantes.length,
		tentatives: resultat.tentatives,
	});

	const sortie = option("sortie", `../bench/results/ctlogs-inventaire-${dateJour}.json`);
	writeFileSync(
		new URL(sortie, import.meta.url),
		`${JSON.stringify({ rapport, sous_domaines: sousDomaines, suspects, tentatives: resultat.tentatives }, null, 2)}\n`,
		"utf8",
	);
	console.log(`Rapport écrit : ${sortie}`);
	console.log(`Sous-domaines uniques : ${sousDomaines.length}`);
	console.log(`Certificats suspects : ${suspects.length}`);
	const echecs = rapport.taux_echec;
	console.log(
		`Appels CT : ${echecs.total}, échecs : ${echecs.echecs} (${pct(echecs.echecs, echecs.total)})`,
	);
	for (const [fournisseur, stats] of Object.entries(rapport.par_fournisseur)) {
		console.log(`  ${fournisseur} : ${stats.echecs}/${stats.total} échecs (${pct(stats.echecs, stats.total)})`);
	}
	for (const suspect of suspects.slice(0, 10)) {
		console.log(`  suspect ${suspect.domaine} ~ ${suspect.organisation_cible} (d=${suspect.distance}, ${suspect.premiere_vue})`);
	}

	if (appliquer) {
		const ecriture = await enregistrerInventaire({ sousDomaines, suspects, rapport });
		console.log(
			`Base : ${ecriture.sousDomainesInscrits} sous-domaine(s) et ${ecriture.suspectsInscrits} suspect(s) inscrits.`,
		);
	} else {
		console.log("Mode rapport : aucune écriture en base (ajouter --appliquer).");
	}
}

main()
	.catch((erreur: unknown) => {
		console.error(erreur);
		process.exitCode = 1;
	})
	.finally(async () => {
		await closePools();
	});
