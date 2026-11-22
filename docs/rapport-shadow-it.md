# Sous-domaines CT : classer le risque d'ombre

Un sous-domaine vu dans les journaux Certificate Transparency mais absent de
`asset` n'est pas forcément hostile : c'est souvent un service légitime pas
encore inventorié, parfois un environnement de test oublié, rarement un nom qui
imite une organisation. Cette tranche rend ce tri lisible et reproductible.

## Ce qui est livré

- **Migration `db/migrate-203-shadow-it.sql`** : deux fonctions SQL pures
  (`shadow_distance_edition`, `shadow_classer`), un index sur `asset.value` et
  la vue **`shadow_it`**.
- **Vue `shadow_it`** : une ligne par sous-domaine récent (première vue
  < 30 jours) sans actif inventorié, avec `motif`, `score` (0–100),
  `motif_detail`, `sous_domaine`, `domaine`, `organisation`, `source`,
  `premiere_vue` (notre observation), `certificat_vu_le` (date fournisseur),
  `certificat_id`.
- **Tests `apps/api/test/shadow-it.test.ts`** : cinq cas nommés (wildcard,
  staging, typosquat, légitime, orphelin), le critère `count(*) >= 10` et
  l'invariant « chaque ligne a un score borné et un motif ».
- **Vérification `pnpm verifie:shadow-it`** : base neuve, migrations, inventaires
  versionnés, requête du juge exécutée mot pour mot, cinq cas nommés classés,
  sortie brute affichée.
- **Client CT** : un `429` avec `Retry-After` court (≤ 5 s) est rejoué une fois ;
  un `Retry-After` long reste un quota épuisé, mesuré sans bloquer la collecte.
  Les appels Cert Spotter sont espacés de 7 s : l'edge renvoie `429` sur une
  rafale.

## Le classement

| Motif | Score | Sens |
|---|---:|---|
| `typosquat` | 90 (d=1) / 82 (d=2) | le domaine copie une organisation connue (même suffixe, étiquette à 1–2 caractères) |
| `wildcard` | 80 | nom couvert par un certificat joker : hôte non attesté |
| `staging` | 70 | environnement de test ou de préproduction exposé (`staging`, `test`, `dev`, `preprod`, `recette`, `uat`, `sandbox`…) |
| `orphelin` | 55 | domaine inconnu du référentiel, aucun actif ne le réclame |
| `legitime` | 15 | domaine d'une organisation connue, hôte pas encore inventorié |

L'ordre de priorité est strict : un domaine déjà rattaché au référentiel n'est
jamais un typosquat (sinon `bordeaux.fr` passerait pour une copie de
`bordeauxac.fr`, à deux caractères). Le motif et le score sont calculés à la
lecture : ajouter un actif ou une organisation reclasse la ligne sans réécrire
l'historique.

## Critère de sortie

```sql
SELECT count(*) FROM ct_sous_domaine c
LEFT JOIN asset a ON a.value = c.sous_domaine
WHERE a.id IS NULL
  AND c.premiere_vue > now() - interval '30 days';
```

`pnpm verifie:shadow-it` crée une base neuve, applique `db/init.sql` et toutes
les migrations, charge les inventaires versionnés, exécute la requête ci-dessus,
puis classe les cinq cas nommés. Sortie brute du 22 novembre 2026 :

```text
Inventaires chargés : 415 sous-domaine(s) inscrit(s).

Critère : SELECT count(*) FROM ct_sous_domaine c LEFT JOIN asset a ... >= 10
 count
-------
   415
(1 row)

Vue shadow_it : 415 ligne(s), chacune avec un motif et un score.
   70  staging    beta.bordeaux.fr
   70  staging    bibliotheque-preprod.bordeaux.fr
  … 403 autre(s)

Répartition par motif :
  orphelin  389
  staging   26

Cas nommés :
  OK     80 wildcard  *.verif…-wild.example  → wildcard 80
  OK     70 staging   staging.verif….org-reference.example  → staging 70
  OK     90 typosquat www.verif….org-referenc.example  → typosquat 90
  OK     15 legitime  www.verif….org-reference.example  → legitime 15
  OK     55 orphelin  www.verif….inconnu-shadow.example  → orphelin 55

OK : 415 >= 10 et 5/5 cas nommés classés.
```

## Provenance des données

Les sous-domaines viennent de **Cert Spotter** (API publique gratuite, sans
clé), interrogé le 22 novembre 2026 sur des domaines de Nouvelle-Aquitaine.
Deux dates distinctes, aucune devinée :

- `premiere_vue` — première observation du nom **par cet inventaire**
  (`now()` au chargement du snapshot ou passage de collecte). C'est elle que
  la fenêtre « nouveau sous-domaine » mesure, et elle ne recule jamais
  (`ON CONFLICT DO NOTHING`).
- `certificat_vu_le` — date la plus ancienne du certificat chez le fournisseur
  (`not_before` / `first_seen`), conservée telle quelle. Un nom observé
  aujourd'hui peut porter un certificat de 2016 : il reste nouveau pour nous,
  et la date fournisseur documente son ancienneté réelle.

crt.sh répondait `502` au moment de la collecte et n'apporte donc aucune ligne
à ce passage.

Inventaires versionnés :

- `bench/results/ctlogs-inventaire-2026-11-21.json` (342 sous-domaines, passage
  précédent) ;
- `bench/results/ctlogs-inventaire-2026-11-22.json` (passage ciblé de cette
  tranche).

## Limites connues

- Le quota anonyme de Cert Spotter est de **10 requêtes par heure** ; la collecte
  est bornée aux domaines qui portent des certificats récents.
- Cert Spotter renvoie au plus les 100 derniers certificats d'un domaine. La
  date fournisseur stockée est celle du plus ancien certificat **renvoyé** : elle
  peut donc être plus récente que l'émission réelle. Elle ne sert qu'à
  documenter, jamais à décider de la récence — `premiere_vue` est notre
  observation, pas une date devinée.
- Le score est un **ordre de tri**, pas une probabilité d'incident. Une ligne
  `typosquat` est un signal à revoir, pas une attaque confirmée.
- Aucune donnée personnelle, aucun secret : uniquement des noms d'hôtes publics
  et les métadonnées de certificats publics.

## Commandes

```sh
# collecte ciblée (Cert Spotter, 5 domaines, écrit le snapshot et la base)
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/inventaire-ctlogs.mts \
  --domaines=bordeaux.fr,bordeaux-metropole.fr,pau.fr,limoges.fr,poitiers.fr \
  --crtsh=off --variantes=0 \
  --sortie=../bench/results/ctlogs-inventaire-2026-11-22.json --appliquer

# critère du juge sur une base neuve
pnpm verifie:shadow-it

# tests
pnpm -F @radar/api test test/shadow-it.test.ts
pnpm -F @radar/api typecheck
```
