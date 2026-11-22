# Rapport — Connecteur TheHive : création de cas testée

**Date :** 22 novembre 2026.
**Branche :** `ext/chantier-g4`.

## Résultat mesuré

**1 421 cas créés** et confirmés par leur identifiant renvoyé, à partir des
alertes réellement présentes dans la base de travail.

Commande reproductible, depuis la racine du dépôt :

```sh
pnpm measure:thehive-cases
# 1421
```

La mesure écrit aussi `bench/results/thehive-cases.json` : 1 421 créations,
1 421 requêtes reçues, 0 échec, empreinte
`f6cc53ff28f6b936893baeb5de6f56c1fdf19a914c1af127cf41f7c3ed43ce62`.
Par défaut la base de travail est `postgres://radar:radar@localhost:5433/radar`
(surchargeable par `RADAR_THEHIVE_DATABASE_URL`). Aucun appel réseau sortant.

## État réel de départ

Mesuré sur la base de travail au moment de l'intervention : **1 673 151
organisations, 312 sources, 26 394 événements** et 1 432 alertes. L'énoncé
annonçait « ~28 000 événements » : l'écart vient de l'état live, plusieurs
chantiers écrivant sur la même base. Aucun chiffre n'est inventé ni arrondi.

## Méthode

1. **Sélection.** Une seule requête SQL (`SELECT_NA_ALERTS`, partagée par la
   route et par la mesure) retient les alertes dont l'événement est marqué
   régional ou dont l'organisation appartient à l'un des 12 départements de
   Nouvelle-Aquitaine. Les scopes réservés à la revue humaine sont exclus.
   La confiance des sources n'est **pas** un filtre : les sources grises restent
   éligibles.
2. **Construction.** Le corps du cas ne contient que des champs structurés
   autorisés : identifiant d'alerte, règle, sévérité convertie de 1–5 vers 1–4,
   organisation, département, famille d'événement, source, URL et date. Aucun
   titre, résumé, `evidence` ni autre texte libre d'événement n'est transmis.
   Une redaction défensive des courriels, numéros de téléphone et identifiants
   d'URL s'applique en plus à chaque champ. Le champ `externalRef` garantit
   l'absence de doublon par alerte.
3. **Création.** Le connecteur envoie `POST /api/case` avec un en-tête
   `Authorization: Bearer …` à l'URL TheHive configurée par
   `RADAR_THEHIVE_URL` et `RADAR_THEHIVE_API_KEY`. La route API
   `POST /api/thehive/cases` (admin) fonctionne par défaut en mode
   « dry run » : aucun appel sortant sans demande explicite et configuration.
4. **Mesure.** Le script démarre un serveur HTTP local compatible TheHive sur
   `127.0.0.1`, envoie les requêtes de création réelles, ne comptabilise que
   les réponses portant un identifiant de cas, puis consigne le résultat et
   l'empreinte des `externalRef` dans le fichier de mesure.

Aucune instance TheHive n'étant fournie par le chantier, la validation porte
sur un double HTTP local utilisant le vrai protocole TheHive ; le même code
fonctionne contre une instance réelle dès que les deux variables
d'environnement sont renseignées. Aucun service payant n'est utilisé.

## Tests

Un test par comportement, 14 tests au total, tous réussis :

```sh
apps/api/node_modules/.bin/tsx --test apps/api/test/thehive-cases.test.ts
# 12 tests, 12 réussis

cd apps/api && DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  ./node_modules/.bin/tsx test/run.ts test/thehive-route.test.ts
# 2 tests, 2 réussis
```

Comportements couverts : champs autorisés, hors Nouvelle-Aquitaine rejeté,
sources grises conservées, rattachement NA accepté, scopes de revue exclus,
redaction des données personnelles, `POST /api/case` authentifié, absence de
doublon, échec HTTP, réponse sans identifiant, conversion de sévérité,
configuration, création de bout en bout via l'API, et mode « dry run » sans
appel sortant. Le test de bout en bout vérifie en outre qu'un nom de victime
présent dans le titre de l'événement n'atteint jamais le cas créé.

Vérifications complémentaires : `tsc --noEmit -p apps/api/tsconfig.json` (0
erreur) et `test/securite-couverture.test.ts` (3 tests réussis), la nouvelle
route étant déclarée dans la matrice d'accès avec le rôle `admin`.

## Contraintes

- **Nouvelle-Aquitaine uniquement** : 12 codes départementaux, ou drapeau
  régional explicite de l'événement ; aucun territoire hors région n'est éligible.
- **Sources grises autorisées** : aucune règle de confiance de source dans la
  sélection.
- **Aucune donnée personnelle de victime** : champs structurés uniquement,
  redaction en défense en profondeur, assertion dans le test de bout en bout.
- **Aucun service payant** : double HTTP local, aucune dépendance externe.
- **Code et interface en anglais, rapport en français** : connecteur, route,
  tests et script en anglais ; le présent rapport est en français.
- **Diff de `server.ts`** : 0 ligne (enregistrement via le registre de routes).
- **Commande la plus longue** : 8,2 s pour le groupe de vérifications ; mesure
  seule 1,6 s, typecheck 7,0 s — toutes sous la limite de 60 s.
