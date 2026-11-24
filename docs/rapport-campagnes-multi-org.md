# Campagnes multi-organismes — qualité mesurée

## Règle de regroupement

Le moteur `apps/api/src/analyse/campagnes.ts` reste déterministe et documenté.
Une ancre supplémentaire relie deux incidents qui partagent **le même acteur
revendiqué et le même mois civil de revendication** (`evidence.claimed_at`),
avec au moins deux organisations distinctes. La fenêtre est de 31 jours et le
mois de revendication est une frontière dure : deux mois différents ne sont
jamais fusionnés, même à quelques jours d'écart. Le motif de preuve est
`groupe-mois:<acteur>:<mois>` ; le mois vient de la revendication, jamais de la
date de collecte.

Les ancres historiques (groupe 14 jours, infrastructure, CVE, titre syndiqué,
organisation + secteur + vecteur 30 jours, borne de 45 jours) sont conservées.
Une même organisation peut apparaître plusieurs fois dans une campagne dès lors
qu'au moins deux organisations distinctes y sont représentées.

## Jeu annoté et mesure

`bench/gold/campagnes-multi-org-20.json` porte 20 campagnes annotées le
2026-11-22 à partir de `bench/gold/incidents-na-500.jsonl` : acteur revendiqué,
mois civil, identifiants d'incidents et nombre d'organisations. Aucune donnée
de contact, aucun secret et aucune source présentée comme locale n'y figure.

La migration `db/migrate-218-campaign-eval.sql` crée `campaign_eval` (une ligne
par modèle, compteurs `tp`/`fp`/`fn`). `evaluerCampagnes` n'accepte qu'une
correspondance exacte d'ensemble d'incidents : une campagne qui en fusionne deux
est comptée comme un faux positif et deux faux négatifs.

## Reproduction

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar pnpm campagnes:build
DATABASE_URL=postgres://radar:radar@localhost:5433/radar pnpm mesure:campagnes
PGPASSWORD=radar psql -h localhost -p 5433 -U radar -d radar -Atc \
  'SELECT tp::float/(tp+fp) AS p, tp::float/(tp+fn) AS r FROM campaign_eval;'
PGPASSWORD=radar psql -h localhost -p 5433 -U radar -d radar -Atc \
  'SELECT count(*) FROM campaign WHERE taille>=3;'
```

## Résultat observé le 2026-11-23

| Mesure | Valeur |
| --- | --- |
| Campagnes annotées | 20 |
| Campagnes détectées (≥ 2 victimes) | 21 |
| Vrais positifs / faux positifs / faux négatifs | 20 / 1 / 0 |
| Précision `p` | 0,9523809523809523 |
| Rappel `r` | 1 |
| Campagnes en base avec `taille >= 3` | 170 |

Sortie brute du critère :

```text
0.9523809523809523|1
170
```
