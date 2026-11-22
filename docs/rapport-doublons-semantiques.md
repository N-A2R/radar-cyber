# Rapport — doublons sémantiques d'organisations en Nouvelle-Aquitaine

## Résultat chiffré

**674 paires détectées, réparties en 651 groupes ; précision mesurée à 98 %**
(98 paires confirmées sur 100 relues une à une ; les 2 paires incertaines sont
comptées comme des faux positifs). Intervalle de Wilson à 95 % : [93,0 % ; 99,5 %].

L'état de départ est celui de la base de travail réelle : **1 673 151
organisations**, **312 sources** cataloguées, **26 259 événements**. Le balayage
couvre **1 671 907 organisations** dans les douze départements de
Nouvelle-Aquitaine ; **81 515 lignes** passent les règles de blocage et
deviennent éligibles à la détection.

## Définition retenue

Un doublon sémantique est une **paire de lignes d'organisation** dont :

- les noms littéraux diffèrent, mais la **clé canonique** est identique :
  casse, accents, ponctuation et ordre des mots ignorés ; formes juridiques
  retirées (`SA`, `SELARL`, `EURL`…) ; synonymes institutionnels développés
  (`CHU` = `centre hospitalier universitaire`, `mairie` = `commune`, `univ` =
  `université`) ; mots outils (`de`, `la`, `des`…) écartés ;
- le **département et la commune** sont les mêmes (les libellés `CEDEX`,
  partagés par plusieurs établissements, sont exclus) ;
- deux **sources d'ingestion distinctes** corroborent la forme : `sirene`,
  `sirene-ferme`, `finess`, `annuaire-education`, `sirene-site` ou provenance
  vide. Les sources grises sont autorisées ; aucune réputation n'est filtrée ;
- aucun **SIREN conflictuel** n'est présent des deux côtés.

Les doublons de nom exact et les doublons d'identité SIREN déjà traités par
`apps/api/src/dedup/org-duplicates.ts` sont exclus : ce chantier ne mesure que
des variantes sémantiques. Le détecteur est **en lecture seule** : aucune
organisation n'est fusionnée.

Exemples relevés : « Mairie de Nueil-les-Aubiers » / « Commune de
Nueil-les-Aubiers » ; « SELARL MA PHARMACIE DE LA GARE » / « MA PHARMACIE DE LA
GARE ».

## Mesure reproductible

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/semantic-duplicates.mts \
  --json=bench/results/semantic-duplicates.json \
  --sample=100 --seed=42 \
  --precision=bench/results/semantic-duplicates-verdicts.json
```

Sortie observée (9 s, bien sous la limite de 60 s) :

```json
{"organisations":1673151,"naOrganisationsScanned":1671907,"eligibleRows":81515,
 "detectedPairs":674,"detectedGroups":651,
 "precision":{"verified":100,"truePositive":98,"falsePositive":2,
              "uncertain":2,"unknownVerdicts":0,"precision":0.98}}
```

Un raccourci est enregistré dans `package.json` :
`pnpm mesure:doublons-semantiques --sample=100 --seed=42 --precision=…`.
Le rapport JSON contient les 674 paires avec identifiants, sources et clés
canoniques ; le fichier de verdicts contient les 100 jugements manuscrits.
La graine `42` et le tri des identifiants rendent l'échantillon stable d'une
exécution à l'autre, même si PostgreSQL renvoie les lignes dans un autre ordre.

## Étapes testables

1. **Clé canonique** — normalisation, synonymes, formes juridiques et ordre des
   mots : trois tests.
2. **Blocage et garde-fous** — périmètre NA, commune, source unique, SIREN
   conflictuel, noms exacts, clés génériques : quatre tests.
3. **Identifiants et échantillonnage** — stabilité des identifiants quel que
   soit l'ordre des lignes, tirage reproductible, précision (incertain = faux
   positif) : trois tests.
4. **Commande de mesure** — exécution de bout en bout sur la base de test avec
   contrôle du nombre de paires et de l'absence d'écriture : un test.

`apps/api/test/dedup-semantic.test.ts` : **11 tests, un par comportement**.
`cd apps/api && ./node_modules/.bin/tsc --noEmit` passe sans erreur.
`apps/api/src/server.ts` n'est pas modifié (0 ligne de diff).

## Deux cas incertains assumés

- Une pharmacie de Panazol apparaît en `SELAS` côté SIRENE et sans forme
  juridique côté FINESS, alors qu'une autre ligne SIRENE porte un SIREN
  différent pour la même enseigne : l'appariement est plausible mais non
  prouvé, donc compté faux positif.
- « SCI CLINIQUE BETHANIE » (société civile immobilière) et « CLINIQUE
  BETHANIE » (établissement de santé) désignent des personnes morales
  distinctes : l'appariement est refusé dans le verdict, bien que le détecteur
  le propose encore.

Ces deux cas montrent la limite de la règle : une forme juridique de
propriété n'est pas toujours l'établissement qu'elle héberge. Un durcissement
éventuel consisterait à exclure les préfixes `SCI`/`GIE` des clés candidates,
au prix de quelques vrais doublons manqués.

## Contraintes

- Nouvelle-Aquitaine uniquement : filtre sur les douze codes départementaux.
- Sources grises autorisées : `sirene-site`, `finess` et `annuaire-education`
  sont traitées comme les sources administratives.
- Aucune donnée personnelle de victime : seules les colonnes
  `name`, `city`, `dept`, `siren` et `entity_source` de `org` sont lues ; les
  tables `ransomware_victim`, `event` et `alert` ne sont pas consultées par le
  détecteur.
- Aucun service payant : recherche déterministe en mémoire, PostgreSQL local,
  sans appel réseau externe.
- Code, interface et commentaires en anglais ; rapport en français.
- `server.ts` inchangé ; toutes les commandes de mesure et de test s'exécutent
  en moins de 60 secondes.
