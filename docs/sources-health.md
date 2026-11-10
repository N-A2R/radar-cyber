# Rendement des sources

Le tableau de santé (`/sources`) dit si une source répond ; ce script dit ce qu'elle rapporte.

```bash
pnpm exec tsx scripts/source-health.mts                      # tableau Markdown complet
pnpm exec tsx scripts/source-health.mts --out /tmp/s.md      # fichier + synthèse stdout
pnpm exec tsx scripts/source-health.mts --json > /tmp/s.json # sortie machine
```

Lecture seule, colonnes explicites, aucun verrou.

| Catégorie | Règle |
| --- | --- |
| dormantes | aucune collecte (`collector_run`) depuis 7 jours — rendement **inconnu** |
| muettes | collectée récemment, mais aucun événement sur 30 jours |
| faibles | 1 à 5 événements sur 30 jours |
| saines | plus de 5 événements sur 30 jours |

La dormance prime : une source qu'on n'interroge plus n'est pas prouvée stérile.

*Événements* = total collecté ; *Événements 30 j* = fenêtre de rendement ; *Médiane collecte* = écart médian
entre deux collectes sur 30 jours (`—` si moins de deux passages, donc non calculable).

Un fort volume ne vaut pas pertinence : croiser avec la famille et `scripts/audit-noise.sql`.
