/** Alertes réservées à la revue : jamais diffusées sur les canaux externes. */

/** Type d'alerte dédié aux agents de rupture historiques : revue uniquement. */
export const ALERT_SCOPE_RUPTURE_REVUE = "rupture-revue" as const;

/** Type d'alerte dédié aux trois agents CPU : revue uniquement. */
export const ALERT_SCOPE_AGENTS_CPU = "agents-cpu" as const;

/** Liste unique utilisée par la diffusion — un nouveau scope de revue s'y ajoute. */
export const ALERT_SCOPES_REVUE = [ALERT_SCOPE_RUPTURE_REVUE, ALERT_SCOPE_AGENTS_CPU] as const;
