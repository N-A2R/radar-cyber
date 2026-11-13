# Le fil parle de la région, ou il ne dit rien

> Chantier du 13 novembre 2026. Colonne `event.regional` (`migrate-035`),
> calculée à l'écriture par `porteeRegionale` — une seule fonction pour les
> cinq voies d'ingestion.

## Le constat, mesuré

Le fil affichait 18 981 événements. Ce qu'il y avait dedans :

| | |
| --- | --- |
| Bulletins de vulnérabilités (NVD) | **16 809 — 87 %** |
| Événements citant un département de la région | **1** |
| Événements rattachés à une organisation | 0 |

Et la notion de « régional » dans la route valait `org_id IS NOT NULL` : faux
partout depuis que les rattachements faux avaient été défaits. Le fil ne
pouvait donc **structurellement rien** montrer de local, tout en affichant un
mur de CVE.

## Ce qui a changé

`event.regional` et `event.regional_motif`, remplis à l'ingestion par :

```ts
porteeRegionale(texte, orgId)
// rattachement : l'événement touche une organisation du référentiel — preuve
// departement  : le texte nomme un des douze départements — indice
// aucun        : ni l'un ni l'autre
```

Deux motifs, deux valeurs : un drapeau sans motif n'est pas auditable.

L'API expose `portee=region|toutes|vulnerabilites` (défaut : `region`). Le front
propose les trois, et **le flux direct respecte la portée** — sans ça, les CVE
continuaient d'arriver en continu et noyaient le fil filtré.

## Le résultat

| Portée | Contenu |
| --- | --- |
| `region` (défaut) | **1** événement |
| `vulnerabilites` | 16 809 bulletins CVE |
| `toutes` | 19 057 événements |

Le fil régional affiche un article de Sud Ouest : « La moitié des sirènes ne
fonctionnent pas », en Gironde et Charente-Maritime.

**Ce chiffre est le résultat, pas l'échec.** Le radar voit exactement un fait
régional, et le dit. Auparavant il en affichait 300 dont aucun ne concernait la
région — un écran plein qui ne disait rien.

## Ce que ça révèle sur la presse

L'article affiché vient de `presse-sudouest` : **la presse régionale n'est pas
bloquée**, contrairement à ce qu'on croyait. Un article de presse qui parle de
cyber passe la porte (mots-clés), reçoit une famille (`cti`), et se rattache.

Ce qui est refusé, c'est la famille `presse` — c'est-à-dire la presse
**non-cyber**. C'est la décision du 10 novembre, et elle est saine.

Le problème n'est donc pas une règle à rouvrir, c'est le **volume** : trente
titres de France 3 Nouvelle-Aquitaine contiennent un seul mot cyber. Le levier
est le nombre de sources régionales, pas le filtre.
