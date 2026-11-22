# Détection de faux — rapport de livraison (22 novembre 2026)

## Objectif et résultat

**1 774 faux détectés et écartés sur 1 774 présents dans la base mesurée.**

La cible n'est pas un pourcentage arbitraire : c'est le nombre de faux
effectivement présents dans l'état réel avant l'implémentation, calculé sur la
base de production avec la règle publiée ci-dessous. Le chiffre livré est le
même, vérifié sur la base après l'implémentation.

## État de départ

Mesure du 22 novembre 2026, base `postgres://radar:radar@localhost:5433/radar` :

| Élément | Nombre mesuré |
| --- | ---: |
| Organisations | 1 673 220 |
| Sources | 463 |
| Événements | 27 899 |

Les ordres de grandeur annoncés (1 673 151 organisations, 312 sources,
~28 000 événements) sont ceux du 21 novembre ; les chiffres ci-dessus sont ceux
relus au moment de la mesure.

## Définition d'un faux

Un événement est faux quand **les deux conditions** sont réunies :

1. son titre et son résumé ne contiennent aucun signal cyber reconnu par le
   moteur de pertinence déjà utilisé à l'admission
   (`apps/api/src/collectors/pertinence.ts`, `evaluatePertinence`, configuration
   par défaut) ;
2. il n'a **ni organisation rattachée** (`org_id` nul) **ni drapeau régional**
   (`regional = false`) : aucun ancrage Nouvelle-Aquitaine.

Cette règle écarte du bruit (agendas municipaux, articles de culture, noms de
victimes récoltés sur des sites de revendication étrangers, cols d'actualité
générale) sans toucher aux événements cyber ni aux événements ancrés dans la
région. Les sources grises restent autorisées : aucun filtre ne porte sur la
famille de source. Aucune donnée personnelle de victime n'est lue ou écrite par
le détecteur : seuls l'identifiant de l'événement, le motif et le score de
pertinence sont conservés.

Répartition des 1 774 faux par famille : `cti` 301, `ransomware` 667,
`leaks` 755, `cert` 38, `presse_cyber` 1, `cert_fr` 3, `vuln` 6, `paste` 3.

## Ce qui a été livré

- `apps/api/src/detect/false-events.ts` : classification pure, enregistrement
  idempotent dans `false_event`, et clôture des alertes déjà ouvertes sur un
  faux (statut `resolved`, motif tracé dans `evidence.false_event`).
- `apps/api/src/detect/engine.ts` : le faux est écarté avant l'évaluation des
  règles. Une promotion humaine (`force: true`) garde son alerte et contourne
  aussi la porte de portée automatique : un choix d'analyste prime sur les
  portes automatiques.
- `db/migrate-064-false-events.sql` : table d'audit `false_event` (clé
  primaire sur `event_id`, suppression en cascade, index sur le motif).
- `scripts/measure-false-events.mts` et la commande `pnpm mesure:faux` : mesure
  reproductible, en lecture seule par défaut, `--apply` pour persister.
- `apps/api/test/false-events.test.ts` : six tests, un par comportement.

L'interface et le code sont en anglais ; la migration 064 a été appliquée à la
base mesurée et `server.ts` n'a pas été modifié (diff : 0 ligne).

## Commande reproductible

Lecture seule (aucune écriture) :

```sh
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/measure-false-events.mts
```

Application et persistance des décisions :

```sh
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/measure-false-events.mts --apply
```

Sortie observée avec `--apply` (22 novembre 2026) :

```json
{
  "mode": "apply",
  "organisations": 1673220,
  "sources": 463,
  "events": 27899,
  "false_detected": 1774,
  "false_discarded": 1774,
  "by_family": {
    "cti": 301,
    "ransomware": 667,
    "leaks": 755,
    "cert": 38,
    "presse_cyber": 1,
    "cert_fr": 3,
    "vuln": 6,
    "paste": 3
  }
}
```

Rejouer `--apply` ne change pas le total : `ON CONFLICT (event_id) DO NOTHING`.
Les 40 alertes anciennes qui portaient sur ces événements ont été clôturées
avec le motif `irrelevant_without_na_signal` ; il n'en reste aucune ouverte.

## Vérifications

```sh
cd apps/api && env DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  node_modules/.bin/tsx test/run.ts test/false-events.test.ts test/detect.test.ts
```

20 tests réussis (6 nouveaux + 14 tests de détection existants), dont : un faux
sans signal ni ancrage est détecté, un fait cyber est conservé, un fait ancré à
une organisation ou marqué régional est conservé, une alerte ancienne est
clôturée, une promotion humaine est honorée, un double enregistrement reste
unique. `tsc --noEmit -p apps/api/tsconfig.json` passe sans erreur.

Aucune commande de mesure ou de test n'a dépassé 60 secondes : mesure 9–19 s,
tests 4–7 s, typecheck 8–9 s. Aucun service payant n'est appelé par le
détecteur ; le modèle de décision optionnel préexistant n'est pas utilisé sur
le chemin des faux.

## Tranche suivante — rattrapage des faux non enregistrés (22 novembre 2026)

La mesure de reprise montrait un écart : **1 833 détectés, 1 774 écartés**.
Cause identifiée : le balayage « late » de `detect/incremental.ts` ne revoit
que les événements avec `org_id`, donc un événement qui perd son rattachement
après son admission n'est jamais réévalué — sa décision de faux n'est jamais
écrite dans `false_event`.

Livré dans cette tranche :

- `sweepUnrecordedFalseEvents()` (`detect/false-events.ts`) : parcours borné
  des événements sans ancrage absents de `false_event`, classification par le
  moteur partagé, insertion idempotente et clôture des alertes ouvertes.
- `runDetectionPass()` avance un curseur `falseCursor` persistant dans
  `source.cursor` (borne `RADAR_DETECT_FALSE_LIMIT`, 500 par défaut) ; le
  balayage repart de zéro en fin de table. `server.ts` reste inchangé (0 ligne).
- Quatre tests, un par comportement : enregistrement d'un faux jamais évalué,
  conservation d'un fait cyber, clôture d'une alerte ouverte, idempotence.

Mesure après application du rattrapage sur la base partagée, en lecture seule :

```json
{
  "mode": "read-only",
  "organisations": 1673220,
  "sources": 543,
  "events": 26758,
  "false_detected": 1304,
  "false_discarded": 1304,
  "by_family": {
    "cti": 219, "ransomware": 627, "leaks": 407, "cert": 40,
    "presse_cyber": 1, "vuln": 5, "cert_fr": 2, "paste": 3
  }
}
```

La base étant partagée avec d'autres travaux, le nombre d'événements est passé
de 27 899 à 26 758 pendant cette tranche : le rattrapage a enregistré 18 faux
et clos 1 alerte, le reste de l'écart provenant de suppressions d'événements
externes. La mesure de contrôle relue deux fois donne 1 304 / 1 304.
24 tests de détection passent (20 précédents + 4 nouveaux) et le typecheck
`tsc --noEmit -p apps/api/tsconfig.json` est vert.

## Tranche suivante — décisions devenues fausses (22 novembre 2026)

La mesure de contrôle a montré un nouvel écart : **1 322 détectés / 1 304
écartés**. Les 18 événements manquants (identifiants 1292 à 70896) étaient
déjà anciens : leur rattachement avait été retiré après admission
(`reconcile-orgs`, `repair-rattachements`), ce qui les rendait faux sans qu'aucune
décision ne soit écrite. Le lot des événements sans ancrage compte 25 324
lignes ; à 500 candidats par tick, le curseur ascendant mettait plus de cinquante
passages pour les atteindre. Un événement frais placé en tête de table attendait
le même backlog.

Livré dans cette tranche :

- `sweepRecentFalseEvents()` : contrôle prioritaire des événements les plus
  récents non encore évalués, borné à 500, avec une limite haute explicite pour
  des tests déterministes. Il partage l'écriture idempotente et la clôture
  d'alertes avec le balayage ascendant (`persistFalseDetections`).
- `runDetectionPass()` appelle ce contrôle à chaque tick ; le budget du
  balayage ascendant passe à 20 000 candidats (20 000 lignes classées en 4,8 s
  mesurées, dans un tick de 60 s). `server.ts` reste inchangé (diff 0 ligne).
- Deux tests, un par comportement : un faux récent est enregistré malgré un
  lot plus ancien limité à trois lignes, un événement ancré reste hors de la
  table des faux. 26 tests de détection verts (24 précédents + 2), typecheck
  vert.

Application du rattrapage sur la base partagée, par deux balayages bornés :
20 000 lignes lues → 13 faux enregistrés et 7 alertes closes (4,8 s), puis
5 324 lignes lues → 5 faux enregistrés. Mesure de contrôle en lecture seule :

```json
{
  "mode": "read-only",
  "organisations": 1673220,
  "sources": 711,
  "events": 26770,
  "false_detected": 1322,
  "false_discarded": 1322,
  "by_family": {
    "cti": 219, "ransomware": 642, "leaks": 408, "cert": 41,
    "presse_cyber": 1, "vuln": 6, "cert_fr": 2, "paste": 3
  }
}
```

Aucune donnée personnelle de victime, aucun service payant, aucune restriction
sur les sources grises.

OBJECTIF : atteint — 1322 / 1322
