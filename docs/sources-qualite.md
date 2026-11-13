# Sources : ce qui rend, ce qui ne rend pas, et ce qui manquait

> Audit du 13 novembre 2026. Chaque URL a été testée avec **suivi de
> redirection** et comptage des `<item>` réellement présents. Reproductible :
> `tsx scripts/diagnostic-sources.mts`.

## Le constat

| | |
| --- | --- |
| Sources déclarées | 266 |
| Actives | 180 |
| Lues au moins une fois | 159 |
| **Ayant produit un événement** | **33** |
| **Régionales** | **14** |

Le registre se trompait sur lui-même : plusieurs flux étaient marqués
« vérifié HTTP 200 » alors qu'un `301` suffisait à les rendre vides. Une
vérification sans suivi de redirection ne vérifie rien.

## Les flux régionaux, testés un par un

| Flux | Code | Items | Verdict |
| --- | --- | --- | --- |
| `sudouest.fr/rss.xml` | 200 | 20 | rend |
| `sudouest.fr/gironde/rss.xml` | 200 | 20 | **ajouté** |
| `sudouest.fr/pyrenees-atlantiques/rss.xml` | 200 | 20 | **ajouté** |
| `charentelibre.fr/rss.xml` | 200 | 20 | rend |
| `dordognelibre.fr/economie/rss.xml` | 200 | 20 | rend |
| `france3-regions…/nouvelle-aquitaine/rss` | 200 | **30** | **ajouté** |
| `rue89bordeaux.com/feed/` | 200 | 14 | **réparé** (301 avant) |
| `ouest-france.fr/rss/france` | 200 | 10 | **réparé** (301 avant) |
| `mediacites.fr/feed/` | 200 | 10 | **ajouté** |
| `franceinfo.fr/titres.rss` | 200 | 1 | **réparé**, flux faible |
| `francebleu.fr/rss` → `ici.fr/rss` | 200 | **0** | **éteint** : plus de RSS |
| `inria.fr/rss` | 200 | **0** | **éteint** : pas un flux |
| `aquitaine-robotics.com/feed` | 200 | 4 | rend (volume marginal) |

Testés et écartés : `lanouvellerepublique.fr` (403), `lepopulaire.fr` (404),
`larepubliquedespyrenees.fr` (404), `mediacites.fr/bordeaux/feed/` (404),
`lagazettefrance.fr/rss` (404).

## Ce qui a été fait

`db/migrate-033-sources-regionales.sql` :

- **4 sources ajoutées** — dont France 3 Nouvelle-Aquitaine, la seule qui
  couvre les douze départements (30 items, intervalle 30 min) ;
- **3 flux réparés** — l'URL fonctionnait, c'est l'enregistrement qui était
  faux (redirections non suivies) ;
- **2 sources éteintes avec motif** — elles ne sont pas supprimées, elles
  disent pourquoi elles ne rendent rien.

## Ce que les flux régionaux produisent vraiment

Les quatre sources ajoutées ont été exécutées. Elles **lisent** — et n'admettent
rien :

| Source | Items lus | Motif de rejet |
| --- | --- | --- |
| `presse-france3-na` | 30 | `{"motif":"filtre","presse":25,"hors_sujet":5}` |
| `presse-sudouest-gironde` | 20 | `{"motif":"filtre","presse":15,"hors_sujet":5}` |

Le rejet est **volontaire** : depuis le 10 novembre, la famille `presse` est
refusée à l'entrée, sur décision explicite — « la base ne contient que du
cyber ». Ce n'est donc pas un défaut de source, c'est une règle de produit.

Mesure du signal réel dans le flux France 3 Nouvelle-Aquitaine, un relevé de
30 titres : **un seul** contient un mot cyber (`cyberharcèlement`). Les autres
sont de la vie régionale.

Autrement dit : ouvrir la presse régionale rapporterait de l'ordre de
**quelques articles par jour**, à comparer aux 30 items lus par passage. Ce
n'est pas rien — un article « mairie piratée » est exactement le fait qu'on
cherche — mais ce n'est pas le levier principal, et ça contredit une décision
de produit assumée. La question est donc posée, pas tranchée ici.

## Ce que ça ne règle pas

Le trou de fond reste le référentiel : 9 des 10 incidents non rattachés du
corpus le sont parce que l'organisation n'existe pas en base. Aucune source
supplémentaire ne comble ça.

---

## L'entonnoir, et le bon dénominateur

« 12,4 % des sources rendent » était un chiffre calculé sur 266 sources
**déclarées** — dont 107 n'avaient jamais été exécutées une seule fois. Le
dénominateur était faux, donc le taux aussi.

Mesuré le 13 novembre 2026, après triage :

| Étape | Nombre |
| --- | --- |
| Déclarées | 270 |
| Activées | 163 |
| Lues au moins une fois | 163 |
| Ont extrait au moins un item | 57 |
| **Ont produit au moins un événement** | **55** |
| **Rendement des sources réellement lues** | **55/163 = 33,7 %** |
| Rendement sur l'ensemble des sources déclarées | 55/270 = 20,4 % |

**33,7 %** est la seule mesure qui décrive le collecteur. L'autre décrit la
paperasse.

## Les 21 sources jamais lues, tranchées une par une

Aucune n'était « en panne » : elles n'avaient jamais tourné, ou ne pouvaient
pas fonctionner.

| Sorte | Nombre | Décision |
| --- | --- | --- |
| Fonctionnent (758 et 100 items) | 2 | réactivées, jamais exécutées jusqu'ici |
| Répondent 403 / flux vide | 2 | éteintes avec motif |
| API sans clé (HIBP, GitHub) | 2 | éteintes avec motif |
| Page HTML au lieu d'un flux | 9 | éteintes avec motif |
| Canaux Telegram sans RSS | 5 | éteintes avec motif |
| Profil d'exécution local | 1 | éteinte : n'est pas une source réseau |

`db/migrate-034-sources-tranchees.sql`. Toutes réactivables : aucune n'est
supprimée, chacune porte son motif en base.

---

## Le 14 novembre 2026 : la presse généraliste ne rend rien

Mesuré sur une base neuve (schéma complet, 34 335 organisations, collecte réelle) :

| Source | Items lus | Admis |
| --- | --- | --- |
| France 3 Nouvelle-Aquitaine (RSS) | 30 | **0** |
| Sud Ouest — Gironde | 20 | **0** |
| Sud Ouest — Pyrénées-Atlantiques | 20 | **0** |
| Médiacités | 10 | **0** |
| CERT-FR | 40 | 40 |
| CISA KEV | 1 781 | 1 781 |
| RansomLook | 100 | 100 |

Les flux généralistes sont **correctement lus** et **entièrement rejetés** par le
contrat d'admission : un fil d'actualité régional ne contient pas d'incident
cyber au moment où on le lit. Le collecteur n'était pas en cause.

### La correction : interroger Google News avec un mot-clé cyber

`db/migrate-037-sources-presse-ciblee.sql` ajoute 16 flux construits comme une
requête : un mot-clé cyber, un périmètre géographique, une fenêtre (`when:30d`).

Résultat sur la même base, même contrat :

| | Avant | Après |
| --- | --- | --- |
| Événements presse admis | 0 | **200** |
| Rattachés à une organisation | 0 | **1** |

Le rattachement obtenu : « Préfecture de la Gironde, mairie de Bordeaux :
plusieurs sites inaccessibles » → **Commune de Bordeaux**. C'est la première
fois que la chaîne complète — source, collecte, admission, rattachement — est
observée de bout en bout sur une base neuve.

Le chiffre reste petit, et il faut le dire : 200 événements presse pour **un**
rattachement. La raison est connue — les requêtes Google News ignorent en partie
la contrainte géographique (« Cholet », « EFS » remontent dans le flux
« Nouvelle-Aquitaine »). Le prochain levier est la précision de la requête, pas
le volume de sources.
