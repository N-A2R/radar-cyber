# Couverture élargie (règles a et b)
Mesures : `scripts/audit-coverage.mts` (lecture seule), 12 sources `ok_but_empty`, 3 887 items rejetés.
## Règle (a) — CVE exploitable (EPSS ≥ 0,10)

Admis si un CVE cité (titre, résumé, `aliases`/`identifiers`) a un score EPSS dans
`event` (`source_id='epss'`), joint sur l'identifiant, zéro réseau.

| seuil | admis | dont 2025-2026 | part 25-26 |
|---|---|---|---|
| 0,01 | 3 162 | 256 | 94 % |
| 0,05 | 2 832 | 167 | 61 % |
| **0,10** | **2 681** | **136** | **50 %** |
| 0,50 | 1 850 | 93 | 34 % |

0,10 garde la moitié des CVE fraîches (136/272) et reste la barre FIRST « exploitation
probable sous 30 jours » ; 0,01 (94 %) ne distingue plus rien. Un CVE dans le titre passe
déjà par le mot-clé « CVE- » : la règle ne gagne que les CVE des champs structurés.
## Règle (b) — département cité

Admis si titre ou résumé contient, en mot entier, un département de Nouvelle-Aquitaine
(`org.dept`) ou une préfecture. URL jamais lue. Homonymes (Vienne, Lot, Charente,
Dordogne, Creuse, Corrèze, Sèvre, Isle) exigent un terme administratif à ±120 caractères.
Mesuré sur 5 flux de presse régionale : 27 gagnés / 410 rejetés, dont 1 cyber (4 %).
Risque assumé : articles non cyber (sport, faits divers) entrés en famille `presse`,
marqués `dept`, distincts des vrais items régionaux.
## Marquage

`event.admission_rule` : `org`, `epss`, `dept` ou `null` ; migration idempotente
(`ensureCoverageSchema`). Les 100 lignes `epss` en base sont des données de test sans
recoupement : règle (a) activée — 3731/3929 CVE suivies (95 %) dont 2681 issues de `feed:ecrimelabs` ; seuil EPSS 0,10 appliqué sur `event.source_id='epss'`. Voir `docs/epss.md`.

# Homonymie des toponymes — durcissement de la règle (b)
Mesure : `scripts/audit-dept.mts` (lecture seule) rejoue `isRelevant` sur les 3 894
événements de la base, ne garde que les **400 premiers rejetés** (ordre `id`, stable)
et leur applique la règle (b) avec les 24 lieux réellement surveillés.

| | admis / 400 | Vienne | Lot | Pau | Dax | Saintes | Niort |
|---|---|---|---|---|---|---|---|
| avant | **105** | 0 | 0 | 4 | 0 | 0 | 1 |
| après | **107** | 0 | 0 | 1 | 0 | 0 | 0 |

## Ce qui change dans `admitsDepartment`
- frontière de mot stricte déjà en place (`(?<![\p{L}\p{N}])…(?![…])`, unicode) : vérifiée,
  conservée — « Paul » et « Daxx » ne matchent pas ;
- homonymes forts (`AMBIGUOUS_PLACES`) étendus à `pau`, `niort`, `saintes`, `dax`, `landes` ;
- un homonyme n'est retenu que (i) forme composée (`charente-maritime`,
  `lot-et-garonne`, `pyrénées-atlantiques`, `haute-vienne`…), (ii) préposition locative
  collée (`en Vienne`, `à Pau`, `dans le Lot`), ou (iii) terme administratif dans la même
  phrase (`département`, `préfecture`, `commune de`, `ville de`, `agglomération`,
  `métropole`) — fenêtre ±120 caractères, bornée à la phrase ;
- occurrences d'URL retirées du texte avant le match (défense en profondeur : le seul
  appelant, `generic.ts`, ne passe déjà que titre + résumé).

## Composition du solde (+2)
- **6 faux positifs d'homonymie retirés** : « Landes » ×2 (Automnales du foie gras),
  « Niort Rugby Club » ×1, « Pau » ×3 (hippodrome, maternité Navarre, maire de Pau).
- **8 items réentrés par le contexte locatif** exigé par la règle (« en Dordogne »,
  « en Corrèze », « en Charente », « en Creuse ») : ces mentions désignent bien le
  département, mais restent des articles non cyber (marathon, Halloween, formation vélo).
- Reste ~100 items admis qui **nomment une commune ou un département sans aucun terme
  cyber** (charente-maritime, gironde en tête) : ce n'est plus un problème d'homonymie
  mais d'absence de signal cyber. Le tarir demanderait une co-occurrence cyber
  obligatoire, hors du périmètre de ce durcissement.
