# Rapport — SIREN vérifié (Nouvelle-Aquitaine)

Date : 2026-11-21 · Branche : `ext/chantier-a2` · Périmètre : les 12
départements de Nouvelle-Aquitaine (16, 17, 19, 23, 24, 33, 40, 47, 64, 79,
86, 87). Rapport en français ; code, tests et interface en anglais.

## Chiffre livré

**Taux de SIREN valides après audit d'homonymie : 98,36 %**
(1 578 516 organisations vérifiées sur 1 604 767 organisations porteuses d'un
SIREN ; taux exact 0,9836418620273224).

Mesure publiée dans `bench/results/siren-verifie.json`. Commande reproductible,
exécutée en 10,6 s sur la base locale (aucune commande > 60 s) :

```sh
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/audit-siren.mts \
  --json=bench/results/siren-verifie.json
```

Le script ne fait que des `SELECT` sur PostgreSQL et lit le snapshot de registre
versionné `db/data/entreprises-na.json` : aucun réseau payant, aucune écriture
en base, aucune donnée personnelle de victime. Seuls des agrégats sont publiés
ici ; le rapport ne contient ni nom ni SIREN d'organisation.

## État réel de départ

| Compteur | Valeur observée dans la base au 2026-11-21 |
|---|---:|
| Organisations | 1 673 221 |
| Sources | 376 |
| Événements | 27 882 |
| Organisations NA avec SIREN | 1 604 767 |

Les deux premiers compteurs ont bougé depuis le repère de la consigne
(1 673 151 organisations, 312 sources) : la mesure porte sur la base réellement
présente au moment de l'audit, et non sur un chiffre recopié. Les événements
restent cohérents avec l'ordre de grandeur annoncé (~28 000).

## Définition mesurée

Un SIREN est **valide/vérifié** quand :

1. il comporte exactement neuf chiffres et passe le contrôle de clé INSEE
   (Luhn, positions paires doublées) ;
2. son groupe d'identité — nom légal, commune, département, tous normalisés —
   n'est pas disputé par un autre SIREN, **ou** le SIREN exact est corroboré
   par une preuve indépendante : snapshot de registre ouvert (base SIRENE via
   `recherche-entreprises.api.gouv.fr`, sans clé) ou preuve traçable
   (`org_enrichissement`, `champ = 'siren'`, `confiance >= 0.9`, `valeur` égale
   au SIREN audité).

Un homonyme non tranché reste **ambigu** : le moteur ne choisit jamais de
gagnant. Un SIREN mal formé ou à clé fausse est **invalide**. Le dénominateur
est l'ensemble des organisations NA porteuses d'un SIREN, ambiguës incluses.

## Résultats détaillés

| Mesure | Valeur |
|---|---:|
| SIREN structurellement invalides | 14 |
| Groupes d'identité disputés | 12 544 |
| Membres ambigus après audit | 26 237 |
| Organisations vérifiées | 1 578 516 |
| Vérifiées sans corroboration | 1 578 416 (98,36 %) |
| Taux final | **98,36 %** |

## Étapes et tests

1. **Moteur pur** — `apps/api/src/siren/audit.ts` : clé de SIREN, clé
   d'identité, verdicts de groupe, calcul du taux. Aucune dépendance réseau ou
   base. 12 tests, un par comportement, dans
   `apps/api/test/siren-audit.test.ts` : format, clé INSEE, normalisation,
   regroupement, homonyme isolé, homonymes non tranchés, preuve registre,
   preuve traçable, SIREN invalide, dénominateur, cas vide.
2. **Mesure reproductible** — `scripts/audit-siren.mts` : compteurs de base,
   contrôle de forme et de clé en SQL, agrégation des identités, verdicts par
   le moteur pur, publication JSON.
3. **Correction du regroupement** — une première mesure (98,49 %,
   11 588 groupes disputés) groupait en SQL sur `name_norm`, ville et
   département bruts : ponctuation, ligatures et accents de commune empêchaient
   de voir 956 groupes d'homonymes. Le regroupement utilise désormais
   `identityKey()` dans le moteur pur, source unique de normalisation, avec un
   test dédié. La preuve traçable doit en outre porter le **même** SIREN pour
   lever une ambiguïté.
4. **Mesure finale** — 98,36 %, chiffre ci-dessus.

## Vérifications

- `tsx test/run.ts test/siren-audit.test.ts` : 12/12 verts.
- `tsc --noEmit` (api) : vert.
- Commande de mesure : exit 0, JSON relu sur disque, 10,6 s.
- `apps/api/src/server.ts` : 0 ligne modifiée (constraint ≤ 10 lignes).

## Limites assumées

- Le snapshot de registre couvre 13 332 entreprises NA : la plupart des
  homonymes restent donc ambigus et sont comptés comme tels, pas comme
  vérifiés. Le taux est une borne honnête, pas une estimation optimiste.
- Aucune preuve `org_enrichissement` sur `siren` n'est présente dans la base
  au moment de la mesure ; le canal est testé et prêt, mais n'a levé aucune
  ambiguïté (100 organisations seulement changent de verdict avec le snapshot
  de registre, soit +0,006 point).
- Les sources grises sont autorisées mais aucune n'a été nécessaire : la
  mesure repose sur des données de registre ouvert et les données locales
  déjà versionnées. Aucun service payant n'a été utilisé.
