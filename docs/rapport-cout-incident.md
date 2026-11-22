# Impact économique par incident — modèle de coût publié

**Chiffre mesuré (22 novembre 2026) : 102 471 € de coût moyen par incident,
intervalle d'incertitude à 95 % [37 372 € ; 129 125 €].**
Médiane du modèle : 49 235 €. Échantillon : 8 incidents de Nouvelle-Aquitaine
avec un montant publié, sur 146 incidents régionaux vérifiés.

Recherches effectuées avant toute modification :
`gh pr list --state all --search 'impact economique incident'`, `'cout par incident'`,
`'cost per incident'`, `'impact economique'`, `'economic impact'`, `'chantier-r2'`,
`'modele de cout'`, puis énumération des 467 PR ouvertes/fermées et filtrage des
titres et branches sur `econom|économ|cout|coût|cost|r2|impact`. Une seule PR
concerne un coût, #174 « Couverture : coût de la mesure » (fusionnée) : elle
documente le coût de la *mesure de couverture*, pas un coût par incident.
`git log --oneline --all | grep -i 'incident|impact|cout|cost|econom'` ne montre
aucun travail livré sur ce chantier. Aucune PR n'existe pour ce sujet : la
branche `ext/chantier-r2` part donc de `origin/main`.
## État réel de départ

Mesuré par la commande reproductible ci-dessous, sur la base régionale réelle :

| Grandeur | Valeur observée |
|---|---:|
| Organisations de Nouvelle-Aquitaine | 1 673 151 |
| Sources | 312 |
| Événements | 26 259 |
| Incidents du corpus vérifié, tous départements | 187 |
| Incidents en Nouvelle-Aquitaine | 146 |
| Incidents à victime organisationnelle | 53 |
| Incidents avec un montant de coût publié | 8 |

L'ordre de grandeur « ~28 000 événements » de la mission est confirmé ; le
comptage exact à la date de mesure est 26 259. Le corpus d'incidents vérifiés
est plus petit et plus sélectif : c'est la population sur laquelle un montant
économique peut être cité sans inventer de chiffre.

## Méthode publiée

1. **Périmètre.** Un incident entre dans le modèle si son département est l'un
   des douze départements de Nouvelle-Aquitaine (16, 17, 19, 23, 24, 33, 40, 47,
   64, 79, 86, 87). Les sources grises sont autorisées : presse régionale,
   décisions de justice, communiqués officiels. Aucun service payant, aucun
   appel réseau, aucune donnée personnelle de victime.
2. **Extraction des montants.** Lecture de `bench/corpus/incidents-*.jsonl`.
   Reconnaissance des montants en euros français (`24 000 euros`,
   `173.000 euros`, `3,20 €`, `40 millions d'euros`). Un montant n'est retenu
   que si la même clause dit qu'il a été *perdu, payé, extorqué, détourné,
   endommagé ou provisionné*. Sont écartés les montants annoncés (aides
   promises, abonnements, prix), les fonds bloqués ou récupérés et les rançons
   réclamées puis refusées.
3. **Confidentialité.** Seules les victimes organisationnelles sont éligibles.
   Les noms de personnes, adresses, URL d'articles et extraits bruts ne sont
   jamais conservés : le relevé ne contient qu'un identifiant d'incident, un
   département, une date et un montant agrégé.
4. **Un coût par incident.** Les signalements répétés du même montant
   (même département, même date) sont fusionnés ; si un incident cite plusieurs
   montants, le plus élevé est conservé. On obtient 8 observations :
   7 000 €, 15 000 €, 24 000 €, 44 000 €, 75 000 €, 120 000 €, 173 000 €,
   200 000 €.
5. **Modèle.** Ajustement log-normal par maximum de vraisemblance sur les
   logarithmes des coûts observés $x_i$ :

   $$\mu=\frac{1}{n}\sum_i\ln x_i,\qquad
     \sigma=\sqrt{\frac{1}{n-1}\sum_i(\ln x_i-\mu)^2},\qquad
     \mathrm{médiane}=e^\mu,\qquad
     \mathrm{moyenne}=e^{\mu+\sigma^2/2}.$$

   Valeurs ajustées : $\mu=10{,}804354$, $\sigma=1{,}210768$.
6. **Incertitude.** Intervalle à 95 % de la moyenne par bootstrap percentile
   déterministe (graine `20261122`, 2 000 rééchantillonnages avec remise) :
   **[37 372 € ; 129 125 €]**. L'intervalle à 95 % du coût d'un incident
   individuel, $e^{\mu\pm1{,}96\sigma}$, est [4 588 € ; 528 321 €]. La largeur
   de ces intervalles est un résultat mesuré, pas un arrondi discriminant :
   huit montants publiés seulement sont disponibles.

La règle est implémentée une seule fois dans
`apps/api/src/cost/incident-cost.ts` (anglais, sans dépendance) et testée dans
`apps/api/test/incident-cost.test.ts` : 15 tests, un par comportement observable
(départements, montants français, devises, clauses exclues, rançons refusées,
confidentialité, déduplication, ajustement log-normal, bootstrap, modèle sur le
corpus réel).

## Commande reproductible

```bash
pnpm measure:incident-cost
# autre forme, avec l'URL explicite :
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/measure-incident-cost.mts
```

La commande lit la base en lecture seule et le corpus local, écrit
`bench/results/incident-cost.json`, et affiche le chiffre. Elle s'exécute en
environ 1 seconde sur cette machine. Les tests unitaires s'exécutent avec :

```bash
cd apps/api && node_modules/.bin/tsx --test test/incident-cost.test.ts
```

La vérification TypeScript du module passe avec
`apps/api/node_modules/.bin/tsc --noEmit -p apps/api/tsconfig.json`.
`pnpm -F @radar/api typecheck` échoue dans cet environnement pour une raison
d'exécution de pnpm (`ERR_PNPM_UNSAFE_TASK_RUN_STATE_PATH` : `node_modules` est
un lien symbolique), avant tout diagnostic du code.

## Contraintes respectées

- Nouvelle-Aquitaine uniquement : filtre sur les douze codes départementaux.
- Sources grises autorisées ; aucun service payant ; aucun appel réseau.
- Aucune donnée personnelle de victime dans le code, la sortie JSON ou ce rapport.
- Code et interface (noms de fonctions, commentaires, sortie console) en anglais ;
  rapport en français.
- `apps/api/src/server.ts` : **aucune modification** (0 ligne).
- Aucune commande de mesure ou de test supérieure à 60 secondes.

## Limites mesurées

Les 8 montants sont des pertes **déclarées** publiquement, pas des pertes
auditées : 8 incidents sur 146 (5,48 %) seulement publient un chiffre. Le modèle
ne couvre ni les coûts non monétaires, ni les incidents sans montant public, ni
les victimes physiques, volontairement exclues. Il ne s'agit pas d'une
extrapolation aux 26 259 événements de la base : c'est un coût par incident
observé, avec son intervalle d'incertitude.
OBJECTIF : atteint — 1 / 1 modèle de coût par incident publié avec méthode et intervalle à 95 % (8 / 8 incidents à montant publié, moyenne 102 471 €, IC 95 % [37 372 € ; 129 125 €] ; mesure rejouée le 22/11/2026 avec `apps/api/node_modules/.bin/tsx scripts/measure-incident-cost.mts` depuis un répertoire temporaire, sans réécrire `bench/results/incident-cost.json` ; aucun code ni test modifié).
