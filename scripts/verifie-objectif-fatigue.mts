/**
 * Vérification de l'objectif « fatigue d'alerte ».
 *
 *   pnpm verifie:fatigue            # lecture seule
 *   pnpm verifie:fatigue -- --apply # applique la politique puis relit
 *
 * Les deux requêtes du critère sont exécutées telles quelles sur la base
 * visée par DATABASE_URL (par défaut la base de veille exposée en 5433).
 */
process.env.DATABASE_URL ??= "postgres://radar:radar@localhost:5433/radar";

const { applyAlertFatiguePolicy, ligneObjectifFatigue, measureAlertFatigue, objectifFatigueAtteint } =
  await import("../apps/api/src/maintenance/alert-fatigue.js");
const { query, closePools } = await import("../apps/api/src/db.js");

const Q_CHARGE = "SELECT count(*) FILTER (WHERE alerts_per_day<=2)::float/count(*) FROM alert_load_daily;";
const Q_ACQUIT = "SELECT count(*) FILTER (WHERE status<>'open')::float/count(*) FROM alert;";

function premier(rows: Record<string, unknown>[]): unknown {
  const row = rows[0];
  return row ? Object.values(row)[0] : null;
}

try {
  if (process.argv.includes("--apply")) {
    const applique = await applyAlertFatiguePolicy();
    console.log(`politique appliquée : ${JSON.stringify(applique)}`);
  }

  const charge = await query(Q_CHARGE);
  const acquit = await query(Q_ACQUIT);
  const compte = await query<{ jours: string; alertes: string }>(
    `SELECT (SELECT count(*) FROM alert_load_daily) AS jours,
            (SELECT count(*) FROM alert) AS alertes`,
  );

  console.log(`SQL 1 : ${Q_CHARGE}`);
  console.log(`         ${premier(charge.rows)}  (sur ${compte.rows[0]?.jours} organisations-jours)`);
  console.log(`SQL 2 : ${Q_ACQUIT}`);
  console.log(`         ${premier(acquit.rows)}  (sur ${compte.rows[0]?.alertes} alertes)`);

  const mesure = await measureAlertFatigue();
  console.log(
    `détail : ${mesure.openAlerts} ouvertes, ${mesure.systemAcked} doublons acquittés par la politique, ` +
      `${mesure.humanAcked} acquittées à la main, ${mesure.resolved} résolues`,
  );
  console.log(ligneObjectifFatigue(mesure));
  if (!objectifFatigueAtteint(mesure)) process.exitCode = 1;
} finally {
  await closePools();
}
