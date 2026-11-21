# Campagne : Précision du rattachement — quatre nuits

> Objectif : **un taux de précision du rattachement prouvé, reproductible, et qui
> tient sur un échantillon frais** — pas un chiffre qui s'améliore parce qu'on a
> appris par cœur le premier échantillon.
>
> Chaque nuit est une vague autonome de 3-5 h, avec son propre rapport. La
> campagne avance sur un **corpus gelé** entre les vagues, et se vérifie sur un
> **échantillon neuf** à la fin.

## Le problème, en une phrase

Le moteur rattache des revendications et des incidents à des organisations. On
sait qu'il se trompe parfois (la nuit dernière : « CO & CO » attrapait tout
`.co.*`, « LIMITED » absorbait « Boutinot Limited »). On ne sait pas **combien**
il se trompe, ni sur quels cas — donc on corrige à l'aveugle.

## Définitions (à figer avant toute mesure)

| Verdict | Sens |
|---|---|
| **exacte** | l'organisation trouvée est celle que le texte désigne |
| **partielle** | c'est la bonne enseigne/groupe, mais pas l'entité visée (siège vs établissement, filiale vs maison mère) |
| **hors_sujet** | aucune relation réelle (homonyme, mot générique, TLD) |
| **indécidable** | le texte ne permet pas de trancher, même avec le registre |

**Précision** = (exacte + partielle/2) / (exacte + partielle + hors_sujet), les
indécidables sortis du dénominateur et comptés à part. Cette formule se fige ici
et ne change plus de toute la campagne.

## Le corpus gelé

- Emplacement : `bench/precision/corpus-v1.json`
- Taille : **500 rattachements réels**, échantillonnés **par strate** :
  confiance (haute/moyenne/faible), source, et type d'indice (domaine, nom,
  sigle, ville).
- Chaque entrée porte : l'indice d'origine, l'organisation proposée, le score,
  la source, la date, et **la preuve** (registre : requête + réponse, ou site :
  URL + extrait verbatim).
- **Règle absolue : le corpus ne se modifie plus après la nuit 1.** On peut
  ajouter des champs, jamais changer un verdict. Un changement de verdict se
  fait dans un fichier séparé, avec sa raison.

---

## Nuit 1 — L'appareil de mesure et la vérité terrain

Objectif : produire le corpus gelé et la précision de départ. **Aucune
correction du moteur cette nuit.** Mesurer d'abord.

- [ ] Écrire `scripts/precision-echantillon.mts` : tirage **stratifié
      reproductible** (graine citée), 500 rattachements réels, écrit
      `bench/precision/corpus-v1.json` avec ses requêtes
- [ ] Pour chaque entrée : vérifier l'identité au registre
      (`recherche-entreprises.api.gouv.fr`) et, si besoin, au site de l'entité ;
      écrire le verdict + la preuve verbatim
- [ ] Publier `bench/results/precision-baseline-2026-11-21.json` : précision,
      répartition par verdict, par strate, et les **10 pires cas** avec leur motif
- [ ] Classer les `hors_sujet` par **mode d'échec** (jeton générique, TLD,
      homonyme, sigle, ville, troncature) — c'est la matière des nuits suivantes
- [ ] Commit : `mesure(precision): corpus v1 gelé et précision de départ publiée`

**Critère :** 500 entrées, chaque verdict avec sa preuve, précision calculable en
une commande, modes d'échec quantifiés.

## Nuit 2 — Les deux modes d'échec dominants

- [ ] Prendre les 2 modes d'échec les plus fréquents du rapport de nuit 1
- [ ] Pour chacun : une règle candidate, écrite, avec ce qu'elle casse ailleurs
- [ ] Mesurer la règle sur le **corpus gelé** (avant/après, par strate)
- [ ] Mesurer sur un **échantillon frais de 100** (autre graine) pour vérifier
      qu'on ne surapprend pas
- [ ] Si une règle dégrade la précision : la retirer et l'écrire
- [ ] Commit par règle retenue

**Critère :** précision sur corpus gelé **et** sur échantillon frais, les deux
publiées. Une amélioration qui ne tient que sur le corpus est un échec.

## Nuit 3 — Les modes restants et les cas limites

- [ ] Les modes d'échec restants, un par un, même protocole
- [ ] Cas limites explicites : sigles (ANSSI, CHU), homonymes d'État, entités
      étrangères citées dans un texte français, noms à un seul mot
- [ ] Constituer un **jeu d'or** de 50 cas pièges (`bench/precision/gold-v1.json`)
      qui doivent rester justes quoi qu'il arrive
- [ ] Commit par lot

**Critère :** chaque mode d'échec a soit une règle, soit une raison écrite de ne
pas en avoir.

## Nuit 4 — La preuve finale

- [ ] Rejouer la mesure sur un **échantillon frais de 500** (graine différente,
      jamais vue)
- [ ] Comparer : corpus gelé vs échantillon frais vs jeu d'or
- [ ] Écrire `docs/rapport-precision-final.md` : précision de départ, précision
      finale, ce qui a marché, ce qui n'a pas marché, et ce qui reste faux
- [ ] `pnpm typecheck` + `bash scripts/verify-all.sh`
- [ ] Commit : `docs(mission): campagne précision — rapport final`

**Critère de campagne :** la précision sur l'échantillon frais est **publiée**,
et toute amélioration est **au-dessus du bruit** (écart entre deux tirages du même
échantillon, à mesurer en nuit 1).

## Règles valables les quatre nuits

1. Un verdict sans preuve n'existe pas. Pas de « probablement ».
2. Le corpus gelé ne se modifie pas. L'échantillon frais ne se réutilise pas.
3. Une règle qui ne tient pas sur l'échantillon frais est retirée.
4. Si la précision baisse après une correction, on le publie et on revient en
   arrière — reculer proprement vaut mieux qu'avancer faux.
5. Aucun chiffre global avant la nuit 4.
