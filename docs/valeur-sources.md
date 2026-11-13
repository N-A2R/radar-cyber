# Ce que vaut une source : trois mesures, pas une note

> Chantier 8. Calculé par `apps/api/src/analyse/valeur-source.ts`, servi par
> `GET /api/sources`, affiché dans la colonne « unicité » du registre.

## Le problème que le rendement ne voit pas

Le registre savait déjà qu'une source *lit sans rendre* (colonne rendement,
chantier 15) et qu'elle *ne répond plus* (état). Il ne savait pas répondre à la
seule question qui compte pour un analyste : **qu'apporte cette source que les
autres n'apportent pas ?**

Un agrégateur peut avoir un excellent rendement, un volume élevé, et ne jamais
rien révéler : il republie ce que tout le monde a déjà. Inversement, une
réédition locale peut publier un fait que personne d'autre ne reprendra — et
c'est elle qu'il faut garder quand on doit arbitrer.

## Les trois mesures

| Mesure | Question | Ne dit pas |
| --- | --- | --- |
| volume (`evenements30j`, `entrees`) | combien de lignes ? | combien de faits nouveaux |
| rendement | quelle part des entrées devient un événement ? | si l'événement est original |
| **unicité** (`faitsUniques / faits`) | sur combien de faits est-elle la seule à parler ? | si elle a raison |

Et deux mesures de position, qui expliquent l'unicité :

- `primeurs` — faits où elle a parlé la première (quand d'autres ont suivi) ;
- `retardMedianHeures` — temps médian pour arriver après le premier signalement.

## Le verdict

- `indispensable` — au moins un fait qu'elle porte seule. La supprimer, c'est
  perdre de l'information.
- `utile` — jamais seule, mais parfois la première.
- `redondante` — elle ne fait que suivre.

Aucune note sur 100 : une note unique de source ne se conteste pas et ne se
corrige pas. Les composantes, si.

## Ce que la mesure a coûté, et ce qu'elle a appris

Mesuré sur 5 000 événements synthétiques (jetables, supprimés) : `GET /api/sources`
reste sous **60 ms** et rend 4 ms à vide sur les 265 sources réelles. Le calcul
ne mérite donc pas de cache pour quinze sources productives ; il en mériterait
un à cent mille événements.

Deux erreurs trouvées en écrivant la mesure, toutes deux dans le sens du chiffre
flatteur :

- **médiane fausse sur effectif pair** — `Math.floor(n/2)` rendait 12 h pour deux
  retards de 2 h et 12 h, au lieu de 7 h. Le biais va toujours vers le chiffre
  qui arrange. Corrigé dans `analyse/mediane.ts`, partagé avec la mesure
  d'anticipation.
- **`Math.max()` sur une liste vide vaut `-Infinity`** — une source qui ne se
  prononçait pas sur la gravité affichait « -Infinity ». Une gravité inconnue est
  `null`, et ne fabrique pas de faux désaccord.

## Ce qu'il reste à faire

Le taux d'unicité ne dit pas si la source a *raison*. La mesure suivante serait
la même, conditionnée à la confirmation ultérieure : sur les faits qu'elle a
révélés seule, combien se sont vérifiés ? Ça demande un historique de faits plus
long que ce que la base de développement contient — c'est la limite honnête de
ce chantier, pas une omission.
