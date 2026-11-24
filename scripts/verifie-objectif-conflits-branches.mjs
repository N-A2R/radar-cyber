/**
 * Mesure reproductible de l'objectif du chantier « conflits branches ».
 *
 *   node scripts/verifie-objectif-conflits-branches.mjs
 *
 * Une branche compte comme arbitrée quand sa décision est tracée dans le
 * rapport avec la PR fermée sans fusion, et quand aucun fichier incompatible
 * n'est présent dans HEAD. Un troisième contrôle vérifie que le rapport
 * déclare l'objectif mesuré. Un contrôle par comportement.
 *
 * Git et fichiers locaux uniquement : ni base, ni réseau, ni service payant,
 * ni donnée personnelle.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const RAPPORT = join(ROOT, "docs/conflits-branches.md");
const CIBLE = 2;

const BRANCHES = [
	{
		nom: "loop/big-collecte-cycle",
		pr: 229,
		head: "f2545711211318dc48aecb0faaf07d81cdba25e1",
		incompatibles: ["db/migrate-049-cycle-collecte.sql"],
		requis: ["db/migrate-050-supervision-collecte.sql"],
		symboles: {
			"apps/api/src/collectors/index.ts": [
				"planifierCycle",
				"executerPlan",
				"classifierSante",
				"delaiBackoffMs",
				"comparerPriorite",
				"SEUIL_ECHECS_MORTE",
				"sourcesJamaisCollectees",
			],
		},
		interdits: {},
	},
	{
		nom: "ext/ch-030-souv-22",
		pr: 688,
		head: "09870dbc39fe03448e09d8b4b5bc6baeffe84429",
		incompatibles: [
			"apps/api/src/collectors/bodacc.collector.ts",
			"db/migrate-200-bodacc-pc.sql",
		],
		requis: [],
		symboles: {},
		interdits: {
			"packages/shared/src/index.ts": ["bodacc"],
			"apps/api/src/contract/admit.ts": ["bodacc"],
			"db/migrate-025-family-contract.sql": ["bodacc"],
		},
	},
];

const rapport = readFileSync(RAPPORT, "utf8");
const present = (rel) => existsSync(join(ROOT, rel));
const lit = (rel) => (present(rel) ? readFileSync(join(ROOT, rel), "utf8") : "");
const commitLocal = (sha) => {
	try {
		execFileSync("git", ["cat-file", "-e", `${sha}^{commit}`], {
			cwd: ROOT,
			stdio: "ignore",
		});
		return true;
	} catch {
		return false;
	}
};

const section = (nom) => {
	const debut = rapport.indexOf(`## \`${nom}\``);
	if (debut < 0) return "";
	const fin = rapport.indexOf("\n## ", debut + 1);
	return rapport.slice(debut, fin < 0 ? rapport.length : fin);
};

const tracee = (branche) => {
	const s = section(branche.nom);
	return (
		s.includes("Décision") &&
		s.includes("État") &&
		s.includes("merged: false") &&
		new RegExp(`#${branche.pr}\\b`).test(s)
	);
};

const propre = (branche) =>
	branche.incompatibles.every((rel) => !present(rel)) &&
	branche.requis.every((rel) => present(rel)) &&
	Object.entries(branche.symboles).every(([rel, symboles]) =>
		symboles.every((symbole) => lit(rel).includes(symbole)),
	) &&
	Object.entries(branche.interdits).every(([rel, termes]) =>
		termes.every((terme) => !lit(rel).includes(terme)),
	);

const tracées = BRANCHES.filter(tracee).length;
const propres = BRANCHES.filter(propre).length;
const tetesLocales = BRANCHES.filter((b) => commitLocal(b.head)).length;
const declaration = rapport.match(
	/^OBJECTIF : (atteint|partiel) — (\d+) \/ (\d+) branches en conflit réel arbitrées sans fusion et sans code incompatible dans main\.$/m,
);
const declaree = Boolean(
	declaration &&
		declaration[1] === "atteint" &&
		Number(declaration[2]) === tracées &&
		Number(declaration[3]) === CIBLE,
);
const atteint = tracées === CIBLE && propres === CIBLE && declaree;

for (const branche of BRANCHES) {
	console.log(
		`${branche.nom} : décision tracée=${tracee(branche) ? "oui" : "non"}, main propre=${propre(branche) ? "oui" : "non"}, commit local=${commitLocal(branche.head) ? "oui" : "non"}`,
	);
}
console.log(`déclaration du rapport : ${declaree ? "présente et cohérente" : "absente ou incohérente"}`);
console.log(
	`OBJECTIF : ${atteint ? "atteint" : "partiel"} — ${tracées} / ${CIBLE} branches en conflit réel arbitrées sans fusion et sans code incompatible dans main (commits locaux : ${tetesLocales} / ${CIBLE})`,
);
if (!atteint) process.exitCode = 1;
