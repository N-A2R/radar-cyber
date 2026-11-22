# Alerte victime en temps réel — latence mesurée

Mesure exécutée le **2026-11-22** sur la base de travail réelle : **1 673 151 organisations**, **312 sources**, **26 221 événements** (empreinte `5d3d76c6…`). Aucune PR antérieure ne couvrait ce sujet : les PR #335 (flux sources, publication → enregistrement) et #356 (publication → première revendication) mesurent d'autres horloges.

## Objectif chiffré et résultat

Objectif retenu : **p50 ≤ 1 000 ms** entre la publication de l'événement dans l'observatoire (`event.created_at`) et la création de l'alerte victime (`alert.created_at`).

| Mesure | Résultat |
| --- | ---: |
| **p50 publication → alerte** | **0 ms** |
| p90 | 0 ms |
| maximum | 0 ms |
| Échantillon sous la cible | **21 / 21** |

L'objectif est atteint. Le chiffre porte sur 21 revendications réelles de victimes en Nouvelle-Aquitaine rejouées par la voie d'alerte elle-même, dans une transaction annulée : aucune ligne de production n'est modifiée par la mesure.

## Définition des horloges

- **Publication** : l'instant où l'événement est publié dans l'observatoire, c'est-à-dire le commit de la ligne `event` (`created_at`). C'est le point de départ que le service contrôle.
- **Alerte** : `alert.created_at`, écrit par le déclencheur dans la **même transaction** que l'événement. Aucun cycle de détection, aucun polling, aucun appel réseau ne s'interpose.
- **Date source** : `event.observed_at`. Elle est publiée séparément et n'est pas fusionnée avec la mesure ci-dessus : sur 7 revendications NA datées des 7 derniers jours, le délai publication source → première trace est de **16,06 h** (p90 26,67 h, 1 sous une heure). Ce délai vient des flux tiers, pas de l'émission de l'alerte.

## Ce qui change

- `db/migrate-064-victim-alert.sql` : fonction `emit_victim_alert()` et déclencheur `AFTER INSERT ON event`. Éligibilité : revendication tierce (`third_party_claim`) des familles `ransomware` / `leaks`, organisation rattachée dont le département est dans la liste Nouvelle-Aquitaine (16, 17, 19, 23, 24, 33, 40, 47, 64, 79, 86, 87) et type d'organisation. Les sources grises sont acceptées : aucun filtre TLP ni liste blanche de sources.
- Aucune donnée personnelle de victime : titre d'alerte générique en anglais, charge utile limitée à identifiants, département, source et horodatages. Ni titre d'événement, résumé, corps brut, e-mail ni nom de personne n'est lu ou écrit.
- `scripts/backfill-victim-alerts.mts` : reprise idempotente des événements déjà en base (7 jours par défaut), sans recréer d'alerte existante.
- `apps/api/test/victim-alert.test.ts` : 7 tests, un par comportement (NA, hors NA, source grise, signal ambiant, absence de donnée personnelle, déduplication, reprise). **7/7 verts**.

## Reproduire

Commande reproductible, sans service payant, moins de 60 s (mesure : < 1 s ; suite ciblée : 31 s) :

```bash
DATABASE_URL=postgres://radar:radar@localhost:5432/radar pnpm measure:victim-alert
```

Dans l'environnement de travail, l'authentification PostgreSQL se fait par socket et l'utilisateur système `radar` :

```bash
sudo -u radar env DATABASE_URL='postgresql:///radar?host=/var/run/postgresql' \
  RADAR_MEASURE_OUTPUT=/tmp/victim-alert-latency.json \
  ./apps/api/node_modules/.bin/tsx scripts/mesure-alerte-victime.mts
```

Résultat brut : `bench/results/victim-alert-latency.json`. Tests :

```bash
sudo -u radar env DATABASE_URL='postgresql:///radar?host=/var/run/postgresql' \
  ./apps/api/node_modules/.bin/tsx apps/api/test/run.ts apps/api/test/victim-alert.test.ts
```

## Limites du chiffre

La mesure évalue la latence de notre chaîne d'émission, pas le délai avec lequel un site tiers publie une revendication. Elle ne couvre que les revendications rattachées à une organisation de Nouvelle-Aquitaine. Le rejeu n'insère aucune donnée de victime : seuls des identifiants et des horodatages d'événements réels sont réutilisés, puis la transaction est annulée. `apps/api/src/server.ts` est inchangé (0 ligne de diff).
