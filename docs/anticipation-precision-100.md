# Précision de l'anticipation J-21 sur 100 incidents

> Rapport généré par `scripts/mesure-precision-anticipation.mts`. Ne pas éditer à la main.

## Résultat

**Précision de décision : 99,00 %** — 99/100 verdicts conformes à la vérité terrain.

Précision de détection : 0,00 % (0 signal(aux) validé(s) pour 23 émis) ; rappel : non estimable (0/0 incidents annoncés par un signe antérieur).

1 incident(s) ont émis un signal ; 1 ont été classés faux positifs. La précision de décision mesure l'exactitude du verdict « signal / rien », pas une capacité prédictive : aucun signe exploitable n'a été produit sur ce corpus.

## Méthode

- Corpus : 100 incidents publics de Nouvelle-Aquitaine, versionnés dans `bench/anticipation/corpus-100.json`, avec date de référence et URL de preuve. Les deux entrées nominatives d'une victime privée sont exclues et remplacées.
- Instantané : `bench/anticipation/J-21-100.jsonl`, construit sur la base réelle par `scripts/anticipation.mts` avec une borne haute exclusive sur `valid_at`.
- Verdict : le détecteur existant (`analyserIncident`) décide « signal » ou « rien ».
- Vérité terrain : un signe n'est vrai que si un nom fourni par le corpus (nom officiel ou mention courte) figure mot pour mot dans le titre d'un événement de la fenêtre.
- Matrice : TP « signal validé », FP « signal non recoupé », FN « signe réel manqué », TN « rien confirmé ». La précision de décision vaut (TP + TN) / 100.

## Mesures

| Mesure | Valeur |
|---|---:|
| Incidents | 100 |
| Événements dans les fenêtres J-21 | 9557 |
| Signaux émis | 23 |
| TP / FP / FN / TN | 0 / 1 / 0 / 99 |
| Précision de décision | 99,00 % |
| Précision de détection | 0,00 % |
| Rappel | non estimable |

## Verdicts

| Incident | Département | Date de référence | Signaux émis | Issue |
|---|---|---|---:|---|
| `na-2026-001` | 33 | 2026-04-06 (dateIncident) | 0 | TN |
| `na-2026-002` | 17 | 2026-08-17 (dateIncident) | 0 | TN |
| `na-2026-003` | 40 | 2026-08-27 (dateIncident) | 0 | TN |
| `na-2026-004` | 64 | 2026-09-11 (dateIncident) | 0 | TN |
| `na-2026-005` | 79 | 2025-12-08 (dateIncident) | 0 | TN |
| `na-2026-006` | 33 | 2026-05-10 (dateIncident) | 0 | TN |
| `na-2026-007` | 47 | 2025-10-03 (dateIncident) | 0 | TN |
| `na-2026-008` | 19 | 2025-01-15 (dateIncident) | 0 | TN |
| `na-2026-009` | 33 | 2026-09-08 (dateIncident) | 0 | TN |
| `na-2026-010` | 33 | 2026-07-16 (dateIncident) | 0 | TN |
| `na-2026-011` | 33 | 2026-07-23 (dateIncident) | 0 | TN |
| `na-2026-012` | 19 | 2026-10-12 (dateIncident) | 0 | TN |
| `na-2026-013` | 64 | 2026-10-12 (dateIncident) | 0 | TN |
| `na-2026-014` | 47 | 2023-12-07 (dateIncident) | 0 | TN |
| `na-2026-015` | 19 | 2024-09-01 (dateIncident) | 0 | TN |
| `na-2026-016` | 16 | 2026-01-20 (dateIncident) | 0 | TN |
| `na-2026-017` | 86 | 2025-08-29 (dateIncident) | 0 | TN |
| `na-2026-018` | 33 | 2025-12-09 (dateIncident) | 0 | TN |
| `na-2026-019` | 33 | 2026-09-07 (datePublique) | 0 | TN |
| `na-2026-020` | 64 | 2026-08-17 (dateIncident) | 0 | TN |
| `na-2026-021` | 40 | 2026-07-25 (dateIncident) | 0 | TN |
| `na-2026-022` | 33 | 2026-04-06 (dateIncident) | 0 | TN |
| `na-2026-023` | 64 | 2026-08-07 (dateIncident) | 0 | TN |
| `na-2026-024` | 86 | 2026-08-01 (dateIncident) | 0 | TN |
| `na-2026-025` | 64 | 2026-04-08 (dateIncident) | 0 | TN |
| `na-2026-026` | 33 | 2026-04-06 (dateIncident) | 0 | TN |
| `na-2026-027` | 33 | 2025-11-15 (dateIncident) | 0 | TN |
| `na-2026-028` | 17 | 2025-10-24 (dateIncident) | 0 | TN |
| `na-2026-029` | 33 | 2026-04-27 (dateIncident) | 0 | TN |
| `na-2026-030` | 17 | 2025-12-11 (dateIncident) | 0 | TN |
| `na-2026-031` | 86 | 2026-03-02 (dateIncident) | 0 | TN |
| `na-2026-032` | 33 | 2026-10-11 (dateIncident) | 0 | TN |
| `na-2026-033` | 79 | 2026-10-11 (dateIncident) | 0 | TN |
| `na-2026-034` | 24 | 2026-10-11 (dateIncident) | 0 | TN |
| `na-2026-035` | 17 | 2026-10-11 (dateIncident) | 0 | TN |
| `na-2026-036` | 86 | 2026-10-11 (dateIncident) | 0 | TN |
| `na-2026-037` | 40 | 2026-10-11 (dateIncident) | 0 | TN |
| `na-2026-038` | 47 | 2026-10-11 (dateIncident) | 0 | TN |
| `na-2026-039` | 33 | 2026-03-25 (dateIncident) | 0 | TN |
| `na-2026-040` | 33 | 2025-10-27 (dateIncident) | 0 | TN |
| `na-2026-041` | 33 | 2026-04-06 (dateIncident) | 0 | TN |
| `na-2026-042` | 87 | 2026-06-22 (dateIncident) | 0 | TN |
| `na-2026-043` | 16 | 2025-11-10 (dateIncident) | 0 | TN |
| `na-2026-044` | 16 | 2026-02-05 (dateIncident) | 0 | TN |
| `na-2026-045` | 33 | 2026-09-04 (dateIncident) | 0 | TN |
| `na-2026-046` | 16 | 2026-01-28 (dateIncident) | 0 | TN |
| `na-2026-047` | 64 | 2025-09-29 (dateIncident) | 0 | TN |
| `na-2026-048` | 24 | 2025-08-11 (dateIncident) | 0 | TN |
| `na-2026-049` | 33 | 2025-02-21 (dateIncident) | 0 | TN |
| `na-2026-050` | 87 | 2025-10-18 (dateIncident) | 0 | TN |
| `na-2026-051` | 87 | 2024-12-15 (dateIncident) | 0 | TN |
| `na-2026-052` | 23 | 2025-06-20 (dateIncident) | 0 | TN |
| `na-2026-053` | 40 | 2022-01-01 (dateIncident) | 0 | TN |
| `na-2026-054` | 40 | 2025-08-26 (dateIncident) | 0 | TN |
| `na-2026-055` | 87 | 2023-09-01 (dateIncident) | 0 | TN |
| `na-2026-056` | 64 | 2024-05-13 (dateIncident) | 0 | TN |
| `na-2026-057` | 33 | 2024-12-31 (dateIncident) | 0 | TN |
| `na-2026-058` | 16 | 2024-05-10 (dateIncident) | 0 | TN |
| `na-2026-059` | 16 | 2025-07-24 (dateIncident) | 0 | TN |
| `na-2026-060` | 33 | 2020-12-01 (dateIncident) | 0 | TN |
| `na-couv-001` | 33 | 2024-04-18 (dateIncident) | 0 | TN |
| `na-charente-003` | 16 | 2024-08-25 (dateIncident) | 0 | TN |
| `na-charente-004` | 16 | 2025-06-13 (datePublique) | 0 | TN |
| `na-charente-005` | 16 | 2025-09-09 (datePublique) | 0 | TN |
| `na-charente-006` | 16 | 2025-11-10 (dateIncident) | 0 | TN |
| `na-charente-007` | 16 | 2026-01-23 (datePublique) | 0 | TN |
| `na-charente-008` | 16 | 2026-01-20 (dateIncident) | 0 | TN |
| `na-charente-009` | 16 | 2026-02-22 (datePublique) | 0 | TN |
| `na-charente-010` | 16 | 2026-03-02 (dateIncident) | 0 | TN |
| `cm-inc-001` | 17 | 2024-07-01 (dateIncident) | 0 | TN |
| `cm-inc-002` | 17 | 2025-02-07 (datePublique) | 0 | TN |
| `cm-inc-003` | 17 | 2025-09-18 (datePublique) | 0 | TN |
| `cm-inc-004` | 17 | 2025-11-27 (datePublique) | 0 | TN |
| `cm-inc-005` | 17 | 2025-12-11 (datePublique) | 0 | TN |
| `cm-inc-006` | 17 | 2026-02-25 (datePublique) | 0 | TN |
| `cm-inc-007` | 17 | 2026-05-21 (dateIncident) | 0 | TN |
| `cm-inc-009` | 17 | 2026-09-07 (dateIncident) | 0 | TN |
| `cm-inc-010` | 17 | 2026-10-12 (dateIncident) | 0 | TN |
| `cm-inc-011` | 17 | 2026-10-30 (datePublique) | 0 | TN |
| `cm-inc-012` | 17 | 2026-11-12 (datePublique) | 0 | TN |
| `cor-001` | 19 | 2025-06-20 (datePublique) | 0 | TN |
| `cor-002` | 19 | 2025-02-12 (datePublique) | 0 | TN |
| `cor-003` | 19 | 2025-02-26 (datePublique) | 0 | TN |
| `cor-004` | 19 | 2024-12-15 (dateIncident) | 0 | TN |
| `cor-005` | 19 | 2025-06-05 (datePublique) | 0 | TN |
| `cor-007` | 19 | 2025-10-18 (dateIncident) | 0 | TN |
| `cor-008` | 19 | 2026-11-05 (datePublique) | 23 | FP |
| `cor-009` | 19 | 2026-11-05 (datePublique) | 0 | TN |
| `na-couv-003` | 64 | 2024-05-31 (dateIncident) | 0 | TN |
| `na-creuse-002` | 23 | 2024-12-12 (datePublique) | 0 | TN |
| `na-creuse-004` | 23 | 2025-05-15 (datePublique) | 0 | TN |
| `na-creuse-005` | 23 | 2025-07-11 (datePublique) | 0 | TN |
| `na-creuse-006` | 23 | 2025-11-10 (dateIncident) | 0 | TN |
| `na-creuse-007` | 23 | 2026-04-29 (datePublique) | 0 | TN |
| `na-creuse-008` | 23 | 2026-08-05 (datePublique) | 0 | TN |
| `na-creuse-009` | 23 | 2026-09-02 (datePublique) | 0 | TN |
| `na-creuse-003` | 23 | 2025-01-17 (dateIncident) | 0 | TN |
| `na-ds-001` | 79 | 2025-12-08 (dateIncident) | 0 | TN |
| `na-ds-002` | 79 | 2025-11-14 (dateIncident) | 0 | TN |
| `na-ds-003` | 79 | 2025-02-27 (dateIncident) | 0 | TN |

## Limites et reproductibilité

- Sources grises autorisées (revendications, canaux de fuite) ; aucun service payant, aucun appel réseau dans la mesure.
- Aucune donnée personnelle de victime n'est publiée : seuls les identifiants, départements et comptages figurent dans ce rapport.
- Un « rien » est un état de couverture, pas une preuve d'absence de signe dans le passé.
- Prérequis base : la colonne `event.valid_at` doit exister ; si elle manque, appliquer la migration versionnée `db/migrate-046-event-bitemporel.sql` avant de reconstruire l'instantané.
- Rejouer : `apps/api/node_modules/.bin/tsx scripts/build-anticipation-corpus-100.mts`, puis `apps/api/node_modules/.bin/tsx scripts/anticipation.mts --corpus=bench/anticipation/corpus-100.json --sortie=bench/anticipation/J-21-100.jsonl --historique=bench/anticipation/historique-reel-100.json`, puis `npm run measure:anticipation:precision-100`.
