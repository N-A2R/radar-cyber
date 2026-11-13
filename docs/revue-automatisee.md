# Revue automatisée : ce qu'on peut trancher, et ce qu'on refuse

> Mesuré le 13 novembre 2026 sur **16 572 revendications** en attente.
> Reproductible : `tsx scripts/mesure-revue.mts` puis `tsx scripts/trier-revue.mts`.

## Ce que le moteur peut trancher

Avant d'écrire une règle d'automatisation, la question était : combien de
revendications le moteur peut-il traiter **sans se tromper** ? Réponse :

| Catégorie | Nombre | Part |
| --- | --- | --- |
| Se rattache à une organisation du référentiel | **1** | 0,0 % |
| Indice = domaine sans organisation en face | 6 009 | 36,3 % |
| Indice = nom libre non résolu | 8 617 | 52,0 % |
| Indice illisible | 1 945 | 11,7 % |

**Une sur seize mille.** Automatiser la *promotion* n'aurait donc traité qu'un
élément — en prétendant avoir industrialisé la revue.

## Ce qui est automatisé

Un triage de **portée**, pas de promotion (`quarantine/portee.ts`) :

| Verdict | Règle | Effet |
| --- | --- | --- |
| `region` | un département de la région est nommé | reste à revoir |
| `hors_perimetre` | indice illisible, ou pays étranger **annoncé** | sort de la file |
| `a_revoir` | rien ne permet de trancher | reste à revoir |

Résultat appliqué :

| | |
| --- | --- |
| Sorties de file | **2 249** (13,6 %) |
| — indice illisible | 1 753 |
| — pays hors périmètre annoncé | 406 |
| — indice vide | 90 |
| Restent en attente | **14 323** |
| Promotions automatiques | **0** |

Chaque sortie écrit un fait `review.decided` au journal : 2 249 faits pour
2 249 sorties. Rien n'est supprimé — un `UPDATE` qui remet `status = 'pending'`
défait le triage.

## Ce qu'on refuse de faire

**On ne promeut pas automatiquement.** La règle « domaine exact = certitude »
existe (confiance 0,95) et resterait juste, mais sur cette file elle ne
s'applique qu'à un cas : ce n'est pas une automatisation, c'est une ligne de
code qui ne changera jamais rien.

**On ne classe pas `a_revoir` en `hors_perimetre`.** 14 323 revendications
n'ont aucun indice exploitable — ni département, ni pays, ni organisation
connue. Les jeter sur l'intuition qu'elles sont étrangères reviendrait à jeter
ce qu'on ne sait pas lire, et à appeler ça du tri.

## Le vrai problème n'est pas la file

16 572 revendications, 1 rattachable : la file n'est pas un travail en attente,
c'est un **déversoir**. Elle grossit de plusieurs centaines par jour et ne
produit presque aucun fait régional.

Le levier est en amont : une source qui produit des revendications que le
référentiel régional ne peut pas rapprocher ne mesure rien. Tant que ce n'est
pas réglé, automatiser la revue revient à mieux ranger un dépôt qui ne devrait
pas se remplir.

---

## Le second passage : archiver sans juger

Après le triage de portée, la file restait à **14 323** revendications, toutes
`a_revoir` — c'est-à-dire « je ne sais pas ». Elles pesaient sur le travail
quotidien sans qu'aucune règle ne puisse les trancher.

Elles ont été **archivées**, pas jugées : statut `reviewed`, motif
`aucun-indice`, un fait `review.decided` par ligne. Le statut compte :
`rejected` affirmerait une décision, `reviewed` dit seulement qu'elles ne sont
plus dans le chemin.

Ce qui n'a pas été archivé : les revendications portant un indice français —
43 mentions de « France », 19 mentions d'une grande ville. **65 ont été
restaurées** en attente, avec un fait de journal disant pourquoi.

| | Avant | Après |
| --- | --- | --- |
| En attente | 16 572 | **65** |
| Rejetées (hors périmètre prouvé) | 0 | 2 249 |
| Archivées (aucun indice) | 0 | 14 258 |
| Promotions automatiques | 0 | **0** |

La file est passée de 16 572 à 65 sans qu'une seule revendication soit
promue, et sans supprimer une ligne. C'est le seul résultat acceptable : une
file vide par suppression serait un mensonge, une file vide par décision
documentée est un tri.

### Ce que ça change pour la suite

Une file de 65 est une file qu'un humain peut lire. Une file de 16 572 n'est
pas une file de travail, c'est un déversoir — et le déversoir continue de se
remplir : `ransomwatch` produit des centaines de revendications par jour, dont
la mesure dit qu'aucune ne se rattache à une organisation régionale.
