#!/usr/bin/env -S npx tsx
/**
 * Géocodage des organisations — outil en ligne de commande.
 *
 * Usage :
 *   npx tsx scripts/geocode-orgs.mts [--dry-run] [--force] [--limit=N] [options]
 *
 *   --dry-run       interroge les API et affiche les correspondances sans écrire
 *   --force         réexamine les orgs déjà géocodées (geo_source « manuel » protégé)
 *   --limit=N       plafonne le nombre d'orgs examinées (contrôle, rodage)
 *   --orgs-only     ne propage pas les coordonnées vers les événements
 *   --events-only   ne fait que la propagation org → événements (pas d'appel API)
 *
 * Sans --dry-run, la propagation org → événements est lancée après le
 * géocodage (geocodePendingEvents), sauf --orgs-only.
 */
import { closePools } from "../apps/api/src/db.js"
import { geocodeOrgs, geocodePendingEvents } from "../apps/api/src/collectors/geocode.js"

const log = (msg: string): void => console.log(`[geo] ${msg}`)

function usage(): never {
  console.error(
    "usage : npx tsx scripts/geocode-orgs.mts [--dry-run] [--force] [--limit=N] [--orgs-only] [--events-only]",
  )
  process.exit(1)
}

const args = process.argv.slice(2)
const dryRun = args.includes("--dry-run")
const force = args.includes("--force")
const orgsOnly = args.includes("--orgs-only")
const eventsOnly = args.includes("--events-only")

if (args.includes("--help") || args.includes("-h")) usage()

let limit: number | undefined
const limitArg = args.find((arg) => arg.startsWith("--limit="))
if (limitArg) {
  const raw = limitArg.slice("--limit=".length)
  limit = Number(raw)
  if (!Number.isInteger(limit) || limit <= 0) {
    console.error(`--limit invalide : « ${raw} » (entier positif attendu)`)
    process.exit(1)
  }
}

if (orgsOnly && eventsOnly) {
  console.error("--orgs-only et --events-only sont exclusifs")
  process.exit(1)
}

try {
  if (!eventsOnly) {
    log(
      `géocodage des orgs${dryRun ? " (dry-run, aucune écriture)" : ""}` +
        `${force ? " — force" : ""}${limit !== undefined ? ` — limite ${limit}` : ""}`,
    )
    const summary = await geocodeOrgs(log, { limit, dryRun, force })
    log(
      `bilan : ${summary.geocoded} org(s) géocodée(s), ${summary.unresolved} sans correspondance, ` +
        `${summary.skipped} ignorée(s) — ${Object.entries(summary.bySource)
          .filter(([, n]) => n > 0)
          .map(([source, n]) => `${source}=${n}`)
          .join(", ") || "aucune source"}`,
    )
  }

  if (!dryRun && !orgsOnly) {
    const { updated } = await geocodePendingEvents(log)
    log(`propagation org → événements : ${updated} événement(s) hérité(s)`)
  }
} finally {
  await closePools()
}
