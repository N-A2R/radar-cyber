# Les sources : 265 lignes, et presque rien pour dire si elles valent quelque chose

> Diagnostic du chantier 14. Chiffres régénérables par
> `tsx scripts/diagnostic-sources.mts --json=bench/results/diagnostic-sources-2026-11-13.json`.
> Ce document ne les répète pas, il les met en perspective — et il dit surtout ce
> qui n'est **pas** mesuré.

## Ce que dit la base, sans interprétation

```
265 sources
  12  en échec d'accès réseau depuis le poste de mesure (fetch failed)
  86  désactivées, motif écrit en base
 167  jamais tentées
   0  cassée de façon prouvée
   0  productive aujourd'hui
```

Les 12 échecs sont tous `fetch failed` — la signature d'un accès réseau refusé,
pas d'une source morte. Le script de diagnostic les classe `environnement` et
**refuse d'en conclure quoi que ce soit** : c'est exactement le piège qui, plus
tôt dans le projet, avait fait passer 60 sources saines pour des sources mortes.

Le reste est plus gênant : **167 sources sur 265 n'ont jamais été tentées**. Le
catalogue a été écrit (16 fichiers SQL, 150 déclarations, 145 sources uniques)
mais jamais confronté au réseau. On ne sait donc pas si elles marchent : on sait
seulement qu'on ne l'a pas vérifié.

## Le trou : un seul état là où il en fallait deux

L'écran `/sources` répondait à « la source répond-elle ? » avec `last_ok_at`.
C'est la mauvaise question. Une source peut répondre 200 tous les jours pendant
six mois et ne rien rendre : elle est **saine et inutile**. L'inverse est vrai
aussi — les 60 sources « muettes » qui ont rendu 2 046 événements à la première
relance étaient périmées, pas cassées.

Le produit confondait donc trois situations distinctes :

| Situation | Ce que ça veut dire | Ce qu'il faut en faire |
|---|---|---|
| lit, et rend | elle travaille | rien |
| lit, et ne rend rien | porte ou parseur en cause **localement** | instruire le filtre, pas la source |
| n'a rien lu | le collecteur est passé pour rien | vérifier l'URL, le format, le réseau |
| jamais tentée | **aucun verdict** | ne pas la compter comme saine |

La quatrième ligne est celle qui coûte le plus cher : une ligne de catalogue
qu'on ne vérifie jamais donne l'illusion d'une couverture.

## Ce qui est désormais mesuré, et où

`GET /api/sources` expose, par source : `entrees` et `rejets` (somme des
`items_in` / `items_skipped` sur 30 jours), `evenements30j`, `evenementsTotal`,
`dernierRun`, `dernierRunStatut`, `disabledReason`, et `rendement`.

**`rendement` vaut `null`, jamais `0`, quand aucune entrée n'a été lue.** C'est
la règle la plus importante de ce chantier : un zéro se corrige, une absence de
mesure se constate. Les confondre conduit à désactiver des sources qu'on n'a
jamais interrogées.

L'écran sources trie désormais **par gravité** : d'abord les sources qui lisent
sans rien rendre, puis les muettes, puis les non mesurées, puis les productives.
Le registre sert à trouver ce qui ne marche pas, pas à admirer ce qui marche.

Les transitions sont journalisées (`source.changed`, `collectors/reveil.ts`) :
`reveil`, `assoupissement`, `panne`, `reparation`. Un état stable n'écrit rien —
un silence qui dure n'est pas un événement. Une source jamais tentée n'a pas
d'état, donc pas de transition : on ne la condamne pas par omission.

## Ce qui reste non mesuré, et pourquoi

| Question | Réponse aujourd'hui |
|---|---|
| La source répond-elle ? | oui / non / inconnu — `last_error`, `last_ok_at` |
| Que lit-elle ? | **par source, sur 30 j** — `collector_run` |
| Que rend-elle ? | **par source, sur 30 j** — `event` |
| Pourquoi rejette-t-elle ? | **par motif** — `collector_run.items_rejected` (migration 029) |
| Quel motif de rejet domine ? | **oui** — `motifDominant` dans `/api/sources`, colonne à l'écran |
| Une famille est-elle couverte ? | **non agrégé** |

Le motif de rejet est désormais un fait de base, pas une ligne de log. C'était le
point aveugle du chantier 15 : savoir qu'une source rejette 40 entrées sur 40 ne
dit pas s'il faut accuser la porte de pertinence (`hors_sujet`), le classement de
famille (`presse`), la détection de menu (`menu_path`) ou le contrat
(`contrat:famille-inconnue`). Le collecteur calculait ce détail depuis toujours
et le perdait.

Encore non mesuré : la couverture par famille (a-t-on au moins une source
productive dans chaque famille publiée ?). C'est la prochaine question utile.

## Ce que je n'ai pas pu faire ici

Le réseau de ce poste de mesure est filtré : **aucune source n'a pu être
interrogée pour de vrai**. Le taux de sources réellement productives est donc
**inconnu, pas mauvais**. La conclusion « le catalogue est peut-être excellent »
est aussi valide que l'inverse ; la seule chose établie est qu'on ne le savait
pas, ce qui est déjà mieux que de croire le savoir.

À rejouer depuis un environnement ouvert, dans cet ordre :

```bash
tsx scripts/diagnostic-sources.mts          # qui répond, qui échoue, et pourquoi
tsx scripts/source-health.mts --out /tmp/s.md   # rendement par source
tsx scripts/triage-sources.mts              # cause du silence, source par source
```
