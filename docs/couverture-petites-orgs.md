# Couverture des organisations de moins de 50 salariés — 21 novembre 2026

## Question et périmètre

> Sur les incidents publics de Nouvelle-Aquitaine du corpus, combien concernent
> une organisation de moins de 50 salariés, et combien le radar les a vus ?

- **Corpus** : `bench/fixtures/corpus-reference-na.json`, 60 incidents vérifiés
  sur pièce, dont **42 dans la fenêtre de mesure** `2025-11-01 → 2026-10-31`.
  Le taux est calculé sur ces 42, comme dans `docs/couverture-mesuree.md` ; les
  18 autres sont du contexte hors dénominateur.
- **« Vu »** : motif `vu` de `scripts/mesure-couverture.mts`, tel que publié le
  21 novembre dans `docs/couverture-mesuree.md` (28 vus / 42). La qualité
  (`exacte`, `partielle`, `hors_sujet`) est celle du même fichier.
- **Taille** : tranche d'effectif SIRENE de l'entité victime, relevée le
  21 novembre sur `https://recherche-entreprises.api.gouv.fr/search`
  (champ `tranche_effectif_salarie`). Les codes `00`, `01`, `02`, `03`, `11`,
  `12` signifient respectivement 0, 1–2, 3–5, 6–9, 10–19 et 20–49 salariés :
  tous sont « moins de 50 ». La borne basse équivalente dans la base est
  `org.effectif_min < 50`. Les administrations (communes, SDIS, rectorat,
  hôpitaux publics, universités) n'ont pas de tranche SIRENE et sortent donc
  de ce périmètre, plutôt que d'être classées par intuition.

Deux périmètres sont publiés côte à côte, parce que la taille n'est pas
établie avec la même certitude pour tous les incidents :

| Périmètre | Règle | Incidents | Vus | Taux |
| --- | --- | ---: | ---: | ---: |
| **Noyau prouvé** | tranche SIRENE < 50 retrouvée pour la victime | 6 | 4 | **66,7 %** |
| **Périmètre élargi** | noyau + 8 structures locales dont la taille est probable mais non prouvée | 14 | 11 | **78,6 %** |
| Corpus entier (référence) | tous motifs, fenêtre 2025-11 → 2026-10 | 42 | 28 | 66,7 % |

**Chiffre à retenir : 11 / 14 = 78,6 %** dans le périmètre élargi, contre
66,7 % sur l'ensemble du corpus. Le noyau prouvé, seul, est à 4 / 6 = 66,7 %,
c'est-à-dire exactement le taux global : il n'y a donc **pas de défaut de
rattachement propre aux petites organisations une fois qu'elles sont dans le
corpus**. Le trou est ailleurs, en amont.

## Incident par incident

| Incident | Entité visée | Tranche SIRENE | Taille | Vu | Motif / qualité |
| --- | --- | --- | --- | --- | --- |
| na-2026-001 | Ymed (Sooncare) | 843016023 · `02` (3–5) | prouvée | non | `pas_rattache` · `absent_du_referentiel` |
| na-2026-005 | EHPAD Résidence du Parc, Champdeniers | 903191450 · `NN` (amicale de la résidence) | probable | non | `pas_rattache` · `absent_du_referentiel` |
| na-2026-010 | Vignobles Toutigeac | 409719556 · `03` (6–9) | prouvée | oui | exacte |
| na-2026-012 | Intermarché d'Altillac (JALTI) | 349429472 · `12` (20–49) | prouvée | oui | exacte |
| na-2026-016 | Fédération Nationale des Chasseurs | 439220153 · `12` (20–49) | prouvée* | non | `pas_rattache` · `absent_du_referentiel` |
| na-2026-020 | Euskal Moneta | 790029599 · `11` (10–19) | prouvée | oui | exacte |
| na-2026-023 | ERNAT, Orthez | 339293086 · `11` (10–19) | prouvée | oui | exacte |
| na-2026-032 | Intermarché de Gradignan, Parempuyre, Macau, La Teste | non retrouvée à partir de l'enseigne | probable | oui | exacte |
| na-2026-033 | Supermarchés des Deux-Sèvres | non retrouvée | probable | oui | partielle |
| na-2026-034 | Cinq Intermarché de Dordogne | non retrouvée | probable | oui | partielle |
| na-2026-035 | E.Leclerc de Surgères | non retrouvée | probable | oui | exacte |
| na-2026-036 | Magasins de la Vienne | non retrouvée | probable | oui | partielle |
| na-2026-037 | Super U Morcenx / Carrefour Express Rion | non retrouvée | probable | oui | exacte |
| na-2026-038 | Intermarché et Carrefour Market de Marmande | non retrouvée | probable | oui | exacte |

\* La FNC a 20–49 salariés à son siège de Nanterre (92) mais une portée
nationale ; elle est comptée dans le noyau parce que la règle est la tranche
SIRENE, pas l'audience. Sans elle, le noyau serait à 4 / 5 = 80,0 % et le
périmètre élargi à 11 / 13 = 84,6 % : le constat ne change pas.

Les 8 cas « probables » sont des points de vente isolés ou des structures
locales pour lesquelles la recherche par enseigne ne retrouve pas l'entité
juridique exacte. Deux points de vente comparables identifiés par leur commune
ont une tranche `12` (JALTI à Altillac, 349429472 ; GINORLI à Hautefort,
429045040) ; c'est ce qui justifie le classement, sans le transformer en
preuve. L'EHPAD de Champdeniers n'a qu'une « Amicale » en SIRENE, avec tranche
`NN` : il reste donc probable, non prouvé.

## La raison du trou

### 1. Pas dans la presse — la cause dominante

Sur 42 incidents de la fenêtre, seulement **14 (33,3 %) concernent une
structure locale ou petite**, et **6 (14,3 %) ont une taille SIRENE prouvée
< 50**. Dans le référentiel, à l'inverse, **156 863 des 161 228 organisations
ayant une tranche connue ont moins de 50 salariés, soit 97,3 %**. Ce n'est pas
une comparaison de risques : c'est la mesure d'un biais de visibilité. Le
corpus ne contient que des incidents rendus publics et vérifiés sur pièce
(`bench/couverture/README.md`) ; les incidents de petites structures jamais
annoncés en échappent par construction.

Le biais est même quantifiable à l'intérieur du corpus : **7 des 14 incidents
de petites structures (50 %) viennent d'une seule vague de presse**, celle du
12–13 octobre 2026 sur la cyberattaque des supermarchés (La Nouvelle
République, Le Démocrate de Bergerac, actu.fr, Sud Ouest…). Sans cette vague,
le corpus ne comporterait que 7 incidents de petites structures sur 35, soit
20 %. Le taux de 78,6 % mesure donc une capacité de reconnaissance **conditionnée
à la couverture médiatique**, pas la couverture réelle des petites orgs.

### 2. Pas dans le référentiel — ou du moins pas avec leur taille

Dans la base courante (21 novembre), sur **1 644 604 lignes d'origine SIRENE**,
**1 483 376 (90,2 %) n'ont aucun `effectif_min`**. Impossible, avec les seules
données du radar, de dire qu'une organisation est « de moins de 50 salariés ».

Pour les 6 victimes du noyau prouvé, l'état courant est le suivant :

- `YMED` est bien en base (id 22044, `effectif_min = 3`) : c'est le seul cas
  où le segment est directement mesurable dans le référentiel ;
- `EARL Vignobles Toutigeac`, `JALTI` (Altillac), `Euskal Moneta` et `ERNAT`
  existent comme fiches créées à partir du corpus (ids 34384, 36636, 34383,
  34382) avec `entity_source` vide **et aucun effectif** : ce sont des noms,
  pas des enregistrements SIRENE enrichis ;
- l'EHPAD est une fiche FINESS sans tranche (id 12529) ;
- la FNC est enregistrée comme `collectivite` à Issy-les-Moulineaux (id 34388),
  hors du périmètre régional tel que le moteur le lit.

La taille a donc dû être relevée dans l'API SIRENE externe pour produire ce
document. Tant que l'effectif n'est pas importé sur ces fiches, le radar ne
peut ni segmenter ses « vus », ni rendre compte de ce trou dans son propre
tableau de bord.

### 3. Pas rattaché — un défaut réel, mais minoritaire

Les **3 incidents non vus** du périmètre élargi (Ymed, EHPAD de Champdeniers,
FNC) ont le même motif dans la mesure du 21 novembre : `pas_rattache` ·
`absent_du_referentiel`. Ce diagnostic dépend de l'instantané de base utilisé
par la mesure (4 480 organisations) : dans la base courante, Ymed et l'EHPAD
ont une fiche, mais sans tranche exploitable pour le second, et la FNC est
classée hors région. La cause exacte est donc « référentiel incomplet ou mal
qualifié » plutôt que « règle de désignation trop stricte ».

À l'inverse, les 7 incidents de grande distribution sont tous `vu`, mais trois
sont de qualité `partielle` (na-2026-033, -034, -036) : le moteur reconnaît
l'enseigne (« hyper u », « super u »), pas le magasin précis. Un taux de 78,6 %
ne doit donc pas être lu comme 78,6 % de rattachements à la bonne structure.

**Verdict : le trou des moins de 50 salariés est d'abord un trou de presse et
de référentiel (taille absente), pas un trou de moteur.**

## Reproductible

```bash
# 1. Corpus et fenêtre
jq -r '.incidents[] | select(.datePublique >= "2025-11-01" and .datePublique <= "2026-10-31")
       | [.id,.datePublique,.entite] | @tsv' bench/fixtures/corpus-reference-na.json

# 2. « Vu » : mesure publiée, colonnes Vu / Motif / Qualité
grep -E '^\| na-2026-' docs/couverture-mesuree.md

# 3. Tranche SIRENE d'une victime (ex. ERNAT, commune Orthez 64430)
curl -sS 'https://recherche-entreprises.api.gouv.fr/search?q=ERNAT&commune=64430' \
  | jq -r '.results[] | [.siren,.nom_complet,.tranche_effectif_salarie] | @tsv'

# 4. Taille dans le référentiel courant (base locale)
PGPASSWORD=radar psql -h localhost -p 5432 -U radar -d radar -c "
  SELECT count(*) FILTER (WHERE effectif_min IS NULL) AS sans_effectif,
         count(*) FILTER (WHERE effectif_min BETWEEN 1 AND 49) AS moins_50,
         count(*) AS total
  FROM org WHERE entity_source LIKE 'sirene%';"
```

## Limites

- La tranche SIRENE est celle du siège de l'entité, pas l'effectif réel du site
  frappé ; un point de vente peut appartenir à un groupe plus grand.
- Les huit cas « probables » ne sont pas des preuves de taille : le taux
  78,6 % est un plafond de lecteur, le noyau prouvé (66,7 %) en est le plancher.
- Les administrations et les entités sans tranche SIRENE sont hors champ,
  alors qu'elles aussi peuvent employer moins de 50 personnes.
- Le résultat est lié à l'état de base du 21 novembre : rejouer
  `scripts/mesure-couverture.mts` sur un autre instantané peut déplacer les
  trois non-rattachements, mais pas le biais de presse décrit plus haut.
