#!/usr/bin/env -S npx tsx
/**
 * Détection passive d'usurpation de domaines d'organisations de Nouvelle-Aquitaine.
 *
 * Usage :
 *   pnpm exec tsx scripts/phishing-typosquat.mts [--apply] [--limit=N]
 *     [--max-variantes=N] [--concurrence=N] [--json=fichier] [--report=fichier]
 *
 * Sources interrogées en réel : DNS public, crt.sh (Certificate Transparency),
 * pages d'accueil publiques et deux flux phishing ouverts. Sans --apply, aucun
 * événement n'est écrit en base.
 */
import { writeFile } from "node:fs/promises";
import { closePools } from "../apps/api/src/db.js";
import {
  analyserCibles,
  chargerCibles,
  enregistrerResultats,
  sondeReelle,
  type ResultatScan,
} from "../apps/api/src/detect/phishing-scan.js";

const log = (msg: string): void => console.log(`[typosquat] ${msg}`);

function usage(): never {
  console.error(
    "usage : pnpm exec tsx scripts/phishing-typosquat.mts [--apply] [--limit=N]" +
      " [--max-variantes=N] [--concurrence=N] [--json=fichier] [--report=fichier]",
  );
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) usage();

function option(name: string): string | undefined {
  const arg = args.find((a) => a.startsWith(`--${name}=`));
  return arg?.slice(name.length + 3).trim() || undefined;
}

function entier(name: string, defaut: number): number {
  const brut = option(name);
  if (brut === undefined) return defaut;
  const valeur = Number(brut);
  if (!Number.isInteger(valeur) || valeur <= 0) {
    console.error(`--${name} invalide : « ${brut} » (entier positif attendu)`);
    process.exit(1);
  }
  return valeur;
}

function rapport(resultat: ResultatScan, evenements: number): string {
  const date = new Date().toISOString().slice(0, 10);
  const taux = (resultat.mesure.taux * 100).toFixed(0);
  const lignes = [
    `# Usurpation de domaines — Nouvelle-Aquitaine (${date})`,
    "",
    `${resultat.cibles} organisations, ${resultat.variantesTestees} variantes testées : ` +
      `${resultat.domainesActifs.length} domaines actifs en DNS, ` +
      `${resultat.usurpations.length} usurpations confirmées par la page publique.`,
    `Facteur de faux positifs : ${resultat.mesure.fauxPositifs}/${resultat.mesure.alarmes} alertes brutes ` +
      `sur un échantillon de ${resultat.mesure.echantillon} domaines actifs (${taux} %).`,
    `Certificats CT obtenus : ${resultat.sources.crtsh.reponses}/${resultat.sources.crtsh.requetes} ; ` +
      `pages lisibles : ${resultat.sources.page.reponses}/${resultat.sources.page.requetes}.`,
    "",
    "Sources : DNS A/AAAA, certificats crt.sh, page d'accueil publique, OpenPhish et Phishing Army.",
    "Aucun scan intrusif, aucune donnée personnelle de victime conservée.",
    "Reproduire : `pnpm mesure:typosquat -- --apply --max-variantes=25`.",
  ];
  for (const { finding, verdict } of resultat.usurpations.slice(0, 5)) {
    lignes.push(
      `- ${finding.domain} → ${finding.orgName} : ${verdict.motifs.join(", ")} ; ` +
        `${finding.cert?.issuer ?? "certificat absent"}, titre « ${finding.page?.title ?? "illisible"} ».`,
    );
  }
  return `${lignes.join("\n")}\n`;
}

try {
  const apply = args.includes("--apply");
  const limite = entier("limit", 0);
  const toutes = await chargerCibles();
  const cibles = limite > 0 ? toutes.slice(0, limite) : toutes;

  log(
    `scan passif${apply ? " avec écriture" : " (dry-run)"} : ${cibles.length} cible(s) ` +
      `(communes du référentiel et établissements publics)`,
  );
  const resultat = await analyserCibles(cibles, sondeReelle, {
    maxVariantes: entier("max-variantes", 30),
    concurrence: entier("concurrence", 8),
    log,
  });

  let evenements = 0;
  if (apply) {
    const ecrit = await enregistrerResultats(resultat);
    evenements = ecrit.evenements;
    log(`${evenements} événement(s) écrit(s)`);
  } else {
    log("aucune écriture en base (ajouter --apply pour appliquer)");
  }

  const jsonPath = option("json");
  if (jsonPath) {
    const domainesActifs = resultat.domainesActifs.map((f) => ({
      ...f,
      page: f.page ? { status: f.page.status, url: f.page.url, title: f.page.title } : null,
    }));
    await writeFile(jsonPath, `${JSON.stringify({ ...resultat, domainesActifs, evenements }, null, 2)}\n`);
    log(`résultat JSON écrit : ${jsonPath}`);
  }
  const reportPath = option("report");
  const texte = rapport(resultat, evenements);
  if (reportPath) {
    await writeFile(reportPath, texte);
    log(`rapport écrit : ${reportPath}`);
  } else {
    console.log(texte);
  }

  log(
    `${resultat.variantesTestees} variantes · ${resultat.domainesActifs.length} actifs · ` +
      `${resultat.usurpations.length} usurpations · ${resultat.urlsPhishing.length} URL rattachées · ` +
      `faux positifs ${resultat.mesure.fauxPositifs}/${resultat.mesure.alarmes}`,
  );
} finally {
  await closePools();
}
