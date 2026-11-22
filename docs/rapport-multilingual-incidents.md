# Rapport — Incidents détectés hors français en Nouvelle-Aquitaine

Date : 2026-11-22 · Branche : `ext/chantier-c6` · Périmètre : les 12 départements
de la Nouvelle-Aquitaine (16, 17, 19, 23, 24, 33, 40, 47, 64, 79, 86, 87).
Rapport en français ; code, tests, corpus et interface en anglais.

## Chiffre livré

**3 incidents détectés hors français**, sur **65 incidents ancrés en
Nouvelle-Aquitaine** présents dans la base au moment de la mesure. Les trois
sont des revendications tierces en anglais (`confirmed_incident` et
`third_party_claim` sont les deux assertions comptées comme incidents).

OBJECTIF : atteint — 3 / 3 incidents hors français détectés sur 65 incidents ancrés en Nouvelle-Aquitaine.

| Langue détectée | Incidents |
|---|---:|
| Français | 61 |
| Anglais | 4 |
| Indéterminé | 0 |
| **Hors français retenus** | **3** |

Sur les quatre détections anglaises, une est écartée du chiffre : l'objet
`51287` (« Dong Engineering Consulting Company Data Breach — revendiqué par
hyflock ») mélange un marqueur français et un titre anglais, avec une confiance
de 0,125, sous le seuil de 0,25 retenu. Les trois retenus (`142014`, `142015`,
`142016`) ont une confiance de 1 et proviennent de `onion:ccw:anubis`.

Résultat versionné : `bench/results/multilingual-incidents.json`. Corpus gelé :
`bench/corpus/incidents-multilingues-na.jsonl` (65 lignes, recopiées de la base
sans donnée personnelle de victime).

## Mesure reproductible

Lecture seule, aucune écriture en base, aucun appel réseau :

```sh
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/measure-multilingual-incidents.mts \
  --json=bench/results/multilingual-incidents.json
```

Rejeu hors base, sur le corpus gelé :

```sh
apps/api/node_modules/.bin/tsx scripts/measure-multilingual-incidents.mts \
  --offline --json=bench/results/multilingual-incidents.json
```

Règle comptée à la lettre :

```sql
SELECT e.id, e.title, e.summary, e.assertion_type, e.regional, o.dept, e.source_id
  FROM event e LEFT JOIN org o ON o.id = e.org_id
 WHERE e.assertion_type IN ('confirmed_incident', 'third_party_claim')
   AND (e.regional OR o.dept IN ('16','17','19','23','24','33','40','47','64','79','86','87'))
```

Puis, pour chaque ligne : français (`fr`), anglais (`en`), allemand (`de`),
néerlandais (`nl`), polonais (`pl`), occitan (`oc`) ou basque (`eu`) selon des
mots outils exclusifs et des expressions fortes ; `und` en cas d'égalité ou de
moins de deux indices. Le titre décide seul dès qu'il est fiable, sinon le
résumé complète. Un incident n'est compté hors français que si sa langue est
distincte de `fr`, déterminée, et d'une confiance ≥ 0,25.

## État réel de départ

Le repère de la consigne (1 673 151 organisations, 312 sources, ~28 000
événements) sert de contexte, pas de chiffre recopié. La mesure lit la base
réellement présente : **1 673 220 organisations**, **463 sources** et
**27 899 événements** au 2026-11-22, par comptage direct en une commande
(`SELECT count(*) FROM org`). Aucune ligne de la base n'a été modifiée.

Le détecteur historique `fr/en` classe 21 des 65 incidents comme anglais : ce
sont pour la plupart des titres français (« … revendiqué par the gentlemen »)
dont le résumé automatique décrit l'entreprise en anglais. La règle multi-langue
corrige ces faux positifs : 61 titres sont reconnus français, 3 anglais réels
sont conservés.

## Étapes testées

1. **Règles pures** — `apps/api/src/multilingualIncidents/index.ts` : détection
   sur sept langues, états vides et indéterminés, seuil de confiance,
   reconnaissance des incidents, ancrage Nouvelle-Aquitaine et décompte.
   **18 tests, un par comportement**, dans
   `apps/api/test/multilingual-incidents.test.ts`.
2. **Corpus vérifié** — 65 incidents réels de la base, dont les titres ont été
   relus un à un : 62 titres français et 3 titres anglais. Le corpus est figé
   et rejouable hors ligne.
3. **Mesure** — `scripts/measure-multilingual-incidents.mts` interroge la base
   en lecture seule, vérifie que le corpus et la base concordent (65 identifiants)
   et publie le décompte par langue et par source.

```sh
apps/api/node_modules/.bin/tsx --test apps/api/test/multilingual-incidents.test.ts
# 18 tests, 18 réussis
```

## Contraintes

- Nouvelle-Aquitaine uniquement : les 12 codes INSEE sont la seule porte
  d'entrée, avec le drapeau `event.regional` existant.
- Sources grises autorisées : aucune source n'a été écartée pour son type.
- Aucune donnée personnelle de victime : ni le corpus figé ni le résultat
  publié ne contiennent de nom de victime, d'adresse ou de coordonnée.
- Aucun service payant : PostgreSQL local et fichiers versionnés seulement.
- Code et interface en anglais, rapport en français.
- `apps/api/src/server.ts` inchangé : **diff de 0 ligne** (≤ 10 demandées).
- Aucune commande supérieure à 60 s.

## Limites

- Les langues occitane et basque sont reconnues par le détecteur et couvertes
  par des tests, mais le corpus d'incidents ancrés ne contient aucun titre dans
  ces langues : elles n'ajoutent donc rien au chiffre mesuré.
- Un titre mêlant deux langues et proche de l'égalité reste indéterminé par
  prudence ; le chiffre publié ne compte pas ces cas.
- Le module est un analyseur en lecture seule : il n'ajoute pas de colonne
  `event.langue` ni de migration. La base locale ne porte pas cette colonne,
  faute de migration 047 appliquée (collision de numéros de version) ; aucun
  comportement d'ingestion n'a été modifié.
