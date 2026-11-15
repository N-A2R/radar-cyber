# Le trou du référentiel, en liste de courses

> Chantier 13. Re-mesuré le **15 novembre 2026** sur la base courante
> (41 801 organisations, dont 7 436 importées SIRENE hors numérique le 14).
> Reproductible :
> `tsx scripts/manques-referentiel.mts --json=bench/results/manques-referentiel-2026-11-15.json`
> et `tsx scripts/mesure-manques.mts`.

## Deux cohortes, deux natures de trou

### 1. La cohorte vivante — ce qui manque aujourd'hui

Les entités nommées par les faits reçus (revendications ransomware) et
absentes du référentiel, au 15 novembre :

| | |
|---|---|
| Entités nommées mais absentes | **500** |
| En France — vrais manques, mesurables | **199** |
| Sans aucun indice de zone | 301 |
| Déclarées hors zone par la source | 0 |

Par voie de chargement (zone et voie par entité — c'est le critère du
chantier) : `sirene` **6** (entités légales), `annuaire-administratif` **9**
(collectivités), `manuel` **485** (associations, fédérations, domaines bruts).
Par corroboration : 285 entités citées par 2 sources distinctes, 215 par une
seule.

La liste complète, entité par entité, est dans
`bench/results/manques-referentiel-2026-11-15.json`.

### 2. La cohorte Exa 302 — refermée ailleurs, quasi toutes étrangères

Les 302 entités qualifiées par Exa en novembre (12 chargées, 290 absentes)
sont massivement **étrangères ou hors région** : États américains, provinces
canadiennes, comtés anglais, Italie, Turquie, Japon… Elles referment un trou
de *revendications internationales*, pas le trou *régional*. Le trou régional
— les petites structures — a été traité ailleurs : l'import SIRENE hors
numérique du 14 novembre (7 436 entreprises, couverture 35,7 % → 64,3 %,
voir `docs/mesure-couverture.md`).

## Test d'identité automatique — refus documenté

Trois entités France portant un domaine exploitable ont été cherchées dans le
répertoire Sirene (`recherche-entreprises.api.gouv.fr`, gratuit) avec une
règle stricte : **candidat unique et nom égal, sinon rien**. Résultat — trois
refus, chacun documenté pour l'arbitrage humain :

| Entité (revendication) | Ce que l'API rend | Verdict |
| --- | --- | --- |
| `epr-groupe.fr` | 7 résultats flous, aucun « EPR GROUPE » | introuvable |
| `groupe-sobotram.fr` | **deux** sociétés : SINFINIM (SOBOTRAM), 725420053, Dracy-le-Fort (71) — et SOBOTRAM TRANSPORTS ET LOGISTIQUE, 450810072, Crissey (39) | homonymie, arbitrage humain |
| `dgm-industrie.fr` | **deux** sociétés : DGM INDUSTRIE, 437632227, Jossigny (77) — et DGM INDUSTRIES, 798012373, Champtocé-sur-Loire (49, en région) | homonymie, arbitrage humain |

`Transtec SAS` reste dans les désaccords Exa (l'arbitrage du 13 novembre penche
pour un acteur colombien, `transtec.com.co`) : arbitrage humain, comme les
quatorze autres.

**Aucun SIREN n'a été inventé, aucun rattachement forcé.** Une entité dont
l'identité n'est pas établie reste sur la liste de courses — c'est la
doctrine du projet appliquée au référentiel.

## Ce que ça change pour la mesure de couverture

La mesure du 15 novembre publie **27/42 (64,3 %)** — contre 5/15 (33,3 %) au
moment où ce document a été ouvert. Le gain est venu du référentiel
(7 436 entreprises SIRENE, alias d'enseignes), pas de cette liste : les
cohortes ci-dessus continuent de décrire **ce qui reste à chercher**, entité
par entité, avec sa zone et sa voie.
