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
recoupement : règle (a) inerte jusqu'au prochain rafraîchissement réel.
