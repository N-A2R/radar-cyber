# Fiches avec historique : la fiche dit ce qui a changé, pas seulement où on en est

> Chantier 18. Calculé dans `apps/api/src/analyse/historique.ts`, servi par
> `GET /api/orgs/:id` (`historique`), affiché dans la fiche organisation.

## Le problème

La fiche d'organisation répond à « que sait-on maintenant ? ». Elle ne répond
pas à la question qu'un analyste se pose devant une organisation qui remonte :
**est-ce que c'est nouveau, ou est-ce qu'on la voit tout le temps ?**

Sans cette distinction, deux organisations très différentes se ressemblent :
celle qui vient d'apparaître dans trois faits et celle qui en a trente étalés
sur deux ans.

## Ce que calcule `historique.ts`

Un profil mensuel sur 12 mois, à partir des faits regroupés (donc en comptant
les faits, pas les lignes) :

| Champ | Question |
| --- | --- |
| `premier`, `dernier` | depuis quand on la connaît, quand on l'a vue pour la dernière fois |
| `parMois` | un histogramme de 12 mois, avec les mois vides à `0` |
| `tendance` | `nouveau` / `en hausse` / `stable` / `en baisse` / `ancien` |
| `familles` | ce qui revient : la même famille plusieurs fois n'est pas anodin |
| `sources` | combien de sources distinctes depuis toujours, et lesquelles |

La tendance compare les **90 derniers jours** aux 90 précédents. Le vocabulaire
est volontairement grossier : sur des volumes de dix faits, annoncer « +37 % »
serait de la fausse précision.

- `nouveau` — rien avant 90 jours, quelque chose depuis ;
- `ancien` — rien depuis 90 jours, alors qu'on la connaissait avant ;
- `en hausse` / `en baisse` — le rapport entre les deux fenêtres ;
- `stable` — tout le reste.

## Affichage

Dans la fiche, sous les faits : `12 faits depuis mars 2025 · 3 sources`, une
barre mensuelle compacte, et une phrase de tendance. Un mois sans fait est
dessiné comme un vide, pas omis : c'est l'absence qui porte l'information.

## La règle de calcul qui compte

L'histogramme compte les **faits**, pas les événements. Une organisation
relayée cinq fois le même jour a un fait ce jour-là. Sinon, un seul incident
bien couvert par la presse ressemblerait à une année d'attaques.

Les mois sont calculés en **UTC** et bornés au mois courant : un fait daté du
futur (date déclarée fausse par une source) ne crée pas de barre à venir.
