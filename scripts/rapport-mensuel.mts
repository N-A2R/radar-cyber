/**
 * Rapport mensuel régional — `docs/rapports/<mois>.md`.
 *
 * Lecture seule sur la base : chaque chiffre vient d'une requête bornée par le
 * mois, sans `now()`. Le document porte la date du mois et l'état de la base
 * (dernière collecte), jamais l'heure d'exécution : deux générations
 * consécutives sur une base inchangée produisent les mêmes octets.
 *
 *   pnpm exec tsx scripts/rapport-mensuel.mts
 *   pnpm exec tsx scripts/rapport-mensuel.mts --mois=2026-11 --out=docs/rapports/2026-11.md
 *   pnpm exec tsx scripts/rapport-mensuel.mts --check
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	fenetreMois,
	genererRapportMensuel,
	rendreRapportMensuel,
} from "../apps/api/src/analyse/rapport-mensuel.js";

process.env.DATABASE_URL ??= "postgres://radar:radar@localhost:5433/radar";

const RACINE = fileURLToPath(new URL("../", import.meta.url));
const SORTIE_PAR_DEFAUT = "docs/rapports/2026-11.md";
const USAGE = `Rapport mensuel de Nouvelle-Aquitaine.

Usage :
  tsx scripts/rapport-mensuel.mts [--mois=YYYY-MM] [--out=chemin.md] [--check]

Options :
  --mois=YYYY-MM   Mois calendarisé en UTC (défaut : 2026-11, ou déduit de --out)
  --out=chemin.md  Fichier Markdown à écrire (défaut : docs/rapports/2026-11.md)
  --check          Compare le fichier sans l'écrire ; échoue s'il diffère
  --help           Affiche cette aide`;

interface Options {
	mois: string;
	out: string;
	check: boolean;
	help: boolean;
}

function options(argv: readonly string[]): Options {
	const brute = Object.fromEntries(
		argv.flatMap((argument) => {
			if (!argument.startsWith("--")) return [];
			const [nom, ...reste] = argument.slice(2).split("=");
			return [[nom ?? "", reste.join("=") || "true"]];
		}),
	);
	for (const nom of Object.keys(brute)) {
		if (!["mois", "out", "check", "help"].includes(nom)) throw new Error(`option inconnue : --${nom}`);
	}
	const out = brute.out && brute.out !== "true" ? brute.out : SORTIE_PAR_DEFAUT;
	const mois = brute.mois && brute.mois !== "true" ? brute.mois : out.match(/\d{4}-(0[1-9]|1[0-2])/)?.[0] ?? "2026-11";
	fenetreMois(mois);
	if (brute.check === "true" && brute.out !== undefined && !brute.out) {
		throw new Error("--out attend un chemin");
	}
	return { mois, out, check: brute.check === "true", help: brute.help === "true" };
}

const { query, closePools } = await import("../apps/api/src/db.js");

async function main(): Promise<void> {
	const opts = options(process.argv.slice(2));
	if (opts.help) {
		process.stdout.write(`${USAGE}\n`);
		return;
	}
	const chemin = resolve(RACINE, opts.out);
	const rapport = await genererRapportMensuel(opts.mois, query);
	const markdown = rendreRapportMensuel(rapport);

	if (opts.check) {
		const existant = readFileSync(chemin, "utf8");
		if (existant !== markdown) throw new Error(`${opts.out} : le rapport ne correspond plus à la base ; le régénérer.`);
		process.stdout.write(`${opts.out} : conforme\n`);
		return;
	}

	mkdirSync(dirname(chemin), { recursive: true });
	writeFileSync(chemin, markdown, "utf8");
	process.stdout.write(
		`${opts.out} — ${rapport.incidents} incident(s), ${rapport.departements.length} département(s), ` +
			`${rapport.sources.length} source(s), délai médian ${rapport.delaiHeures === null ? "non mesuré" : `${rapport.delaiHeures.toFixed(1)} h`}\n`,
	);
}

try {
	await main();
} catch (erreur) {
	process.stderr.write(`rapport-mensuel : ${erreur instanceof Error ? erreur.message : String(erreur)}\n`);
	await closePools();
	process.exitCode = 1;
} finally {
	await closePools();
}
