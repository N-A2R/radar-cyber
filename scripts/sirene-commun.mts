/**
 * Outils partagés des imports SIRENE (stock national).
 *
 * Le format v3 des fichiers SIRENE : séparateur virgule ou point-virgule selon
 * le fichier, champs cités quand ils portent le séparateur, booleans
 * true/false, états A/F, tranches d'effectifs NN/01..53.
 */
import { spawn } from "node:child_process";

export const DEPTS_NA: ReadonlySet<string> = new Set([
	"16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87",
]);

/** Tranche SIRENE → borne basse de l'effectif salarié (NN = non renseigné). */
export const TRANCHE_EFFECTIF_MIN: Record<string, number> = {
	"01": 1, "02": 3, "03": 6, "11": 10, "12": 20, "21": 50, "22": 100,
	"31": 200, "32": 250, "41": 500, "42": 1000, "51": 2000, "52": 5000, "53": 10000,
};

/** Découpe une ligne SCSV en respectant les champs cités (guillemets INSEE). */
export function decouper(ligne: string): string[] {
	const champs: string[] = [];
	let courant = "";
	let cite = false;
	for (let i = 0; i < ligne.length; i++) {
		const c = ligne[i];
		if (cite) {
			if (c === '"') {
				if (ligne[i + 1] === '"') { courant += '"'; i++; }
				else cite = false;
			} else courant += c;
		} else if (c === '"') cite = true;
		else if (c === ";" || c === ",") { champs.push(courant); courant = ""; }
		else courant += c;
	}
	champs.push(courant);
	return champs;
}

/**
 * Lit un CSV depuis un zip, ligne à ligne, sans rien extraire sur disque.
 * Le séparateur est détecté sur l'en-tête (point-virgule dans le géoloc,
 * virgule dans les stocks). Colonnes demandées par leur nom en minuscules.
 */
export async function lireCsv(
	zip: string,
	attendus: readonly string[],
	parLigne: (champs: Record<string, string>) => void,
): Promise<{ lignes: number }> {
	const enfant = spawn("unzip", ["-p", zip], { stdio: ["ignore", "pipe", "inherit"] });
	let reste = "";
	let entete: string[] | null = null;
	let indices: (number | null)[] | null = null;
	let lignes = 0;
	let rescan = "";

	const traiter = (ligne: string): void => {
		if (ligne.length === 0) return;
		if (ligne.startsWith("#") && entete === null) return;
		if (entete === null) {
			entete = decouper(ligne).map((h) => h.trim().toLowerCase());
			const manquants = attendus.filter((a) => !entete!.includes(a));
			if (manquants.length > 0) {
				throw new Error(`colonnes absentes dans ${zip} : ${manquants.join(", ")}`);
			}
			indices = attendus.map((a) => entete!.indexOf(a));
			return;
		}
		const champs = decouper(ligne);
		const objet: Record<string, string> = {};
		for (let i = 0; i < attendus.length; i++) {
			const idx = indices![i];
			objet[attendus[i]] = idx !== null && idx < champs.length ? champs[idx] : "";
		}
		lignes++;
		parLigne(objet);
		if (lignes % 2_000_000 === 0) console.log(`  ... ${lignes.toLocaleString("fr-FR")} lignes lues (${zip.split("/").pop()})`);
	};

	await new Promise<void>((resoudre, echouer) => {
		enfant.stdout.setEncoding("utf8");
		enfant.stdout.on("data", (morceau: string) => {
			rescan += morceau;
			let i;
			while ((i = rescan.indexOf("\n")) !== -1) {
				const ligne = rescan.slice(0, i).replace(/\r$/, "");
				rescan = rescan.slice(i + 1);
				try { traiter(ligne); }
				catch (e) { enfant.kill(); echouer(e); return; }
			}
		});
		enfant.on("error", echouer);
		enfant.on("close", (code) => {
			if (code !== 0) { echouer(new Error(`unzip a échoué (code ${code}) pour ${zip}`)); return; }
			if (rescan.trim().length > 0) traiter(rescan.trim());
			resoudre();
		});
	});
	return { lignes };
}

export function slugifier(nom: string, identifiant: string): string {
	return `${nom
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48)}-${identifiant}`;
}
