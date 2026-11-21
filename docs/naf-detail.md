# Sous-secteurs fins — taux de classement en NAF détaillé

Rapport du 21 novembre 2026. Branche `ext/chantier-a4`.

## État de départ

La base de test partagée porte 1 673 221 organisations, 376 sources et
27 882 événements au moment de la mesure (les compteurs bougent pendant la
vague : l'énoncé de départ citait 1 673 151 organisations, 312 sources et
environ 28 000 événements). Le périmètre de ce chantier est strictement les
douze départements de Nouvelle-Aquitaine, soit **1 671 907 organisations**.

Le référentiel porte déjà un code `org.naf`, mais rien ne garantit qu'il soit
un code APE détaillé de la nomenclature NAF rév. 2 : sur le périmètre NA,
1 489 484 organisations seulement (89,09 %) portent un code de forme
`NN.NNA`. Le reste se répartit en codes hérités à trois chiffres plus lettre
(« 55.3A »), codes de sous-classe à quatre chiffres (« 55.60 ») et codes
manquants. Aucune colonne ni mesure ne portait le classement détaillé : le
taux publié jusqu'ici était celui des neuf grands groupes (100 %), qui ne
dit rien du sous-secteur.

## Définition mesurée

Est comptée comme **classée en NAF détaillé** toute organisation NA dont le
code APE est valide, soit :

1. `org.naf` est déjà un code à quatre chiffres et une lettre ;
2. ou `org.naf_detail` a été écrit par la règle ci-dessous.

Un code est valide s'il figure dans la liste officielle des 732 codes APE de
la NAF rév. 2, copiée dans `apps/api/src/analyse/naf-detail.ts`. Source :
INSEE, jeu « Nomenclature d'activités française (NAF) » sur data.gouv.fr
(identifiant `58a42c4088ee38635f9b81a4`), ressource CSV hébergée par Grand
Lyon. Gratuit, public, reproductible, sans clé ni service payant.

## Règle de classement

Une seule implémentation, `apps/api/src/analyse/naf-detail.ts`, appelée par
le backfill et par les tests :

| Priorité | Entrée | Décision | Confiance |
|---|---|---|---:|
| 1 | `naf` = code APE connu (avec ou sans point) | code tel quel | 0,99 |
| 2 | `naf` = sous-classe à quatre chiffres n'ayant qu'un seul enfant APE dans la nomenclature | cet enfant | 0,90 |
| 3 | `naf` absent et `sector` sans ambiguïté (`commune`, `epci`, `departement`, `region`, `administration`, `hopital`, `pharmacie`) | code de référence du secteur | 0,80 |
| 4 | toute autre valeur | aucune classification (`NULL`) | — |

Aucun code n'est deviné. Les codes hérités à trois chiffres plus lettre ne
sont pas convertis : leur correspondance officielle avec la NAF rév. 2
n'était pas disponible dans une source gratuite et vérifiable ; les convertir
par proximité numérique produirait des activités fausses. Une sous-classe à
plusieurs enfants (par exemple 47.11, qui porte six APE de A à F) reste
également sans classement : choisir un enfant serait un pari.

Le champ `org.naf_detail` n'est écrit que pour les cas 2 et 3 ; le cas 1 est
déjà lu directement dans `org.naf`. La migration `061` ajoute le code, sa
source et sa confiance. Le backfill va par lots de 5 000, en transaction, est
idempotent et consigne un fait agrégé dans le journal. `server.ts` n'a pas
été modifié (0 ligne de diff).

## Commandes reproductibles

```bash
export DATABASE_URL=postgres://radar:radar@localhost:5433/radar
# écriture des cas récupérables (5,4 s sur la base de test)
pnpm backfill:naf-detail
# mesure en lecture seule, sans réseau (1,8 s)
pnpm measure:naf-detail
```

La mesure ne rejoue aucune règle et ne fait aucun appel réseau : elle ne lit
que les colonnes persistées. Elle échoue sous un seuil de 85 %. Les tests de
comportement (un par règle, 11 au total) se lancent avec :

```bash
cd apps/api && ./node_modules/.bin/tsx --test test/naf-detail.test.ts
```

## Mesure obtenue

| Indicateur | Valeur |
|---|---:|
| Organisations de Nouvelle-Aquitaine | 1 671 907 |
| Code APE détaillé déjà présent dans `naf` | 1 489 484 (89,09 %) |
| Organisations classées en NAF détaillé après backfill | **1 500 694 (89,76 %)** |
| Gain | +11 210 organisations, **+0,67 point** |
| Dont sous-classe à enfant unique | 4 480 |
| Dont secteur de référence sans ambiguïté | 6 730 |

Le taux est donc passé de 89,09 % à **89,76 %** sur le périmètre NA. La
mesure est reproductible par la commande ci-dessus ; le chiffre dépend de la
base réellement présente au moment du rejeu, qui continue d'évoluer pendant
la vague.

## Vérifications et contraintes

- 11 tests de comportement réussis (nomenclature complète, code exact,
  normalisation, code inconnu, enfant unique, enfants multiples, sous-classe
  absente, code hérité non deviné, secteur de référence, secteur ambigu,
  calcul du taux) ; `tsc --noEmit` de l'API vert.
- Périmètre : filtre SQL sur les douze départements de Nouvelle-Aquitaine,
  aussi bien au backfill qu'à la mesure.
- Aucune donnée personnelle de victime : seules les colonnes d'organisation
  (`naf`, `sector`, `dept`, `id`) sont lues, aucune table d'incident ou de
  revendication n'est touchée.
- Sources gratuites uniquement : nomenclature INSEE/data.gouv.fr, déjà
  copiée dans le dépôt ; aucun appel réseau dans la mesure, aucun service
  payant.
- Code, messages et noms de colonnes en anglais ; seul ce rapport est en
  français. Aucune interface modifiée, donc aucun texte d'interface à
  traduire.
- Aucune commande de plus de 60 s : backfill 5,4 s, mesure 1,8 s, tests
  0,3 s, typecheck 3,3 s.

## Limites assumées

Le gain est volontairement borné par la qualité des données sources : les
environ 117 000 codes hérités à trois chiffres restent hors du taux. Les
classer exigerait une table de correspondance officielle NAF 1990 → NAF
rév. 2, qui n'a pas été trouvée en source gratuite vérifiable pendant ce
chantier. Le chiffre publié ne compte donc que des codes réellement
déterminés, jamais une approximation.
