/** Alertes réservées à la revue : jamais diffusées sur les canaux externes. */

/** Type d'alerte dédié aux agents de rupture historiques : revue uniquement. */
export const ALERT_SCOPE_RUPTURE_REVUE = "rupture-revue" as const;

/** Type d'alerte dédié aux trois agents CPU : revue uniquement. */
export const ALERT_SCOPE_AGENTS_CPU = "agents-cpu" as const;
/** Type d'alerte dédié à la supervision de la collecte : revue uniquement. */
export const ALERT_SCOPE_SUPERVISION = "supervision-collecte" as const;
/** Type d'alerte dédié à la supervision des sources silencieuses : revue uniquement. */
export const SILENT_SOURCE_SCOPE = "supervision-silent-source" as const;

/** Liste unique utilisée par la diffusion — un nouveau scope de revue s'y ajoute. */
export const ALERT_SCOPES_REVUE = [ALERT_SCOPE_RUPTURE_REVUE, ALERT_SCOPE_AGENTS_CPU, ALERT_SCOPE_SUPERVISION, SILENT_SOURCE_SCOPE] as const;
