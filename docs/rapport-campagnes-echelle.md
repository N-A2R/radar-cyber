# Rapport — Campagnes à grande échelle (22 novembre 2026)

## Objectif mesuré

Objectif : le **nombre de campagnes détectées** sur le corpus réel du radar de Nouvelle-Aquitaine.

| Étape | Campagnes | Corpus |
| --- | ---: | --- |
| Référence publiée (PR #286) | 46 | 27 870 événements |
| Avant ce chantier, sur la base actuelle | 43 | 26 394 événements |
| **Après ce chantier** | **235** | **26 394 événements** |

**Chiffre obtenu : 235 campagnes détectées**, 870 incidents regroupés, taille médiane 2.
La table `campaign` contient 235 lignes après reconstruction (`235 écrites`, `0 retirées`).
L'écart entre les 46 de la PR #286 et les 43 mesurés avant modification vient du
rafraîchissement du corpus (27 870 → 26 394 événements), pas d'une régression du moteur.

## Commande reproductible

Mesure en lecture seule (aucune écriture en base) :

```bash
DATABASE_URL='postgres://radar:radar@localhost:5433/radar' \
  apps/api/node_modules/.bin/tsx scripts/build-campagnes.mts --dry-run \
  | jq -r .rapport.campagnes
# → 235
```

Reconstruction atomique de la table, puis vérification du chiffre stocké :

```bash
DATABASE_URL='postgres://radar:radar@localhost:5433/radar' \
  apps/api/node_modules/.bin/tsx scripts/build-campagnes.mts
PGPASSWORD=radar psql -h localhost -p 5433 -U radar -d radar \
  -Atc 'select count(*) from campaign'
# → 235
```

Si la table n'existe pas encore : `psql -f db/migrate-060-campagnes.sql`.
Toutes les commandes utilisées pour ce chantier s'exécutent en moins de 60 s.

## Méthode par étapes

1. **Ancres historiques conservées** : même groupe ransomware, même infrastructure
   (domaine/IP/certificat), ou même organisation avec secteur et vecteur identiques ;
   fenêtres de 14 et 30 jours, durée maximale de 45 jours. Aucune nouvelle règle ne
   remplace ces signaux ni ne leur donne un poids inférieur.
2. **Ancre CVE** : un identifiant `CVE-AAAA-NNNNN...` explicite dans le titre ou
   dans `evidence` (`cve`, `cveId`, `cve_id`, `identifier`). Deux événements de la
   même famille partageant ce CVE dans les 30 jours forment une campagne de
   vulnérabilité ; le libellé est le CVE lui-même.
3. **Ancre d'avis syndiqué** : un titre d'avis normalisé (au moins 25 caractères,
   hors titres génériques) repris à l'identique par **au moins deux sources
   distinctes** dans les 30 jours, toujours dans la même famille. Un titre court
   ou une seule source ne crée jamais de campagne.

Chaque campagne conserve sa preuve : signaux partagés avec les identifiants
d'événements, voisin de référence, motif du lien (`cve:…`, `headline:…`,
`groupe:…`, etc.) et délai en heures. Le score et la confiance suivent la règle
déjà en vigueur.

## Contraintes respectées

- Périmètre : corpus du radar Nouvelle-Aquitaine (1 673 151 organisations,
  312 sources, 26 394 événements) ; aucune source payante, sources grises
  (ransomware, onion, fuites) autorisées et inchangées.
- Aucune donnée personnelle de victime : les adresses e-mail et les suites de
  chiffres de type téléphone sont retirées du titre **avant** qu'il ne devienne
  une ancre ou un libellé ; aucun nom de victime n'est ajouté.
- Code et interface en anglais pour les nouveaux fichiers (`scale-signals.ts`,
  `scale-campaigns.test.ts`) et les nouveaux symboles ; rapport en français.
- `apps/api/src/server.ts` n'est pas modifié (diff : 0 ligne).
- Un test par comportement observable : 10 nouveaux tests dans
  `apps/api/test/scale-campaigns.test.ts` ; les 5 tests existants de
  `campagnes.test.ts` restent inchangés et verts (15/15 au total).
- Vérifications exécutées : `tsc -p apps/api/tsconfig.json --noEmit` (0 erreur),
  suite ciblée des campagnes (15 tests, 0 échec), mesure et écriture en base.
