# Corrélation revendication et recrutement RSSI — mesure sur 12 mois

## Objectif chiffré et résultat

**Hypothèse :** une organisation qui recrute un RSSI a-t-elle plus de chances d'être touchée par une revendication ?

**Résultat mesuré : hypothèse non confirmée sur les données observables.** Sur la fenêtre de douze mois **2025-12 → 2026-11** :

| Indicateur | Valeur mesurée |
|---|---:|
| Revendications publiables en Nouvelle-Aquitaine | **21** |
| Organisations victimes distinctes | **21** |
| Organisations recrutant un RSSI observées | **1** |
| Victimes ayant publié une offre RSSI avant leur première revendication | **0** |
| **Odds ratio** | **0** |
| **p (Fisher exact unilatéral)** | **1** |
| Verdict | `no_positive_association` |

Le chiffre central de la mesure est donc **0 victime recruteuse sur 21**, avec un odds ratio de **0** et une probabilité de **1** sous l'hypothèse nulle unilatérale : aucune association positive n'est détectée. Ce résultat n'est **pas** une preuve d'absence d'effet : avec un seul employeur recruteur observable, la puissance statistique est très faible et un effet réel pourrait échapper au test. Il ne s'agit pas non plus d'une relation causale.

## État de départ

Base réelle lue en lecture seule sur `localhost:5433/radar` : **1 673 151 organisations**, **312 sources**, **26 259 événements**, dont **1 671 907 organisations** en Nouvelle-Aquitaine. Le dernier événement régional observé date du `2026-11-21T15:53:03Z` ; il fixe la fin de la fenêtre. Les sources grises (ransomware, fuites, CTI) sont conservées ; les événements `TLP:RED` sont exclus. Aucun titre, URL, nom de victime ni donnée personnelle n'est écrit dans la sortie.

## Méthode

1. **Revendications** : événements `third_party_claim` rattachés à une organisation de Nouvelle-Aquitaine (département ou indicateur `regional`), dont la date d'observation tombe dans les douze mois calendaires se terminant au dernier fait régional. Une organisation compte une fois, à sa première revendication.
2. **Recrutement** : offres publiques d'emploi récupérées sur le moteur de recherche public de France Travail (gratuit, sans clé), avec six pages (trois requêtes de titre, deux tranches triées par date). Seules sont conservées les offres dont le département publié est en Nouvelle-Aquitaine et dont le titre désigne strictement un RSSI/CISO (les intitulés génériques « réseaux et sécurité » sont rejetés, ainsi que les agences d'intérim qui publient pour un client non identifié). Deux offres NA ont été collectées ; **une** employeur direct subsiste après ce filtre.
3. **Exposition** : une victime est dite exposée si l'offre RSSI de son organisation (rapprochement par nom normalisé, sans accent ni ponctuation) est antérieure ou égale à la date de sa première revendication. Le résultat est un tableau 2×2 ; l'odds ratio vaut `(a×d)/(b×c)` et le test est un Fisher exact unilatéral.
4. **Limites du signal** : le tableau d'offres public ne rend visible qu'une fenêtre récente (essentiellement ~30 jours) et ne couvre qu'un seul employeur direct NA sur la période. L'absence de chevauchement mesurée doit être lue comme « aucune association détectable avec ce signal », pas comme la preuve que recruter un RSSI ne change pas le risque. Le rapprochement par nom est strict : un recrutement annoncé sous une raison sociale différente n'est pas attribué à la victime.

## Commande reproductible

Collecte du jeu de données versionné (facultative, réseau public gratuit, ~4 s) :

```bash
pnpm collect:rssi-recruitment -- --check
```

Mesure reproductible sur la base réelle (~1 s) :

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  pnpm measure:recruitment-claim -- --json=bench/results/recruitment-claim-12m-2026-11-22.json --check
```

`--check` échoue si le périmètre n'est pas Nouvelle-Aquitaine seule, si la fenêtre ne compte pas douze mois, si une revendication n'est pas de type `third_party_claim`, si une offre n'est pas datée dans la fenêtre, si un champ non autorisé apparaît, ou si la base ne correspond plus à l'état de départ. Empreinte du résultat : `426a1b11fe6c3615`. Sortie machine : `bench/results/recruitment-claim-12m-2026-11-22.json`. Jeu de données : `bench/corpus/rssi-recruitment-na.json`.

## Tests et contraintes

Treize tests, un par comportement : titres stricts, agences d'intérim, normalisation des noms, dates relatives, analyseur HTML sans champ personnel, fenêtre à douze mois, filtres hors périmètre, antériorité de l'offre, rejet des titres génériques, odds ratio et Fisher sur un tableau positif, absence d'association, contrôle « aucune donnée personnelle », rejeu déterministe. 13/13 verts ; `tsc --noEmit -p apps/api/tsconfig.json` passe.

`apps/api/src/server.ts` est inchangé (0 ligne de diff). Nouvelle-Aquitaine seule, sources grises autorisées, aucune donnée personnelle de victime, aucun service payant, aucune commande au-delà de 60 s. Code et interface en anglais, rapport en français.

OBJECTIF : atteint — 0 / 21 victimes recruteuses sur 12 mois (cible 0 / 21 ; odds ratio 0, p = 1, verdict `no_positive_association` ; valeur livrée lue par `jq '.counts.exposedVictims, .counts.victimOrganisations' bench/results/recruitment-claim-12m-2026-11-22.json` → 0, 21, empreinte `426a1b11fe6c3615`, mesure reproductible `pnpm measure:recruitment-claim -- --json=bench/results/recruitment-claim-12m-2026-11-22.json --check` exécutée le 22/11/2026 avec code 0 ; rejeu du même jour sur la base partagée élargie : 0 / 15 victimes, même verdict).
