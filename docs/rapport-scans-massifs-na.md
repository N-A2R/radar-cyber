# Rapport — Scans massifs visant la région (22 novembre 2026)

## Objectif mesuré

Objectif : détecter les campagnes de scan visant les IP de Nouvelle-Aquitaine
à partir de sources publiques, sans aucun scan actif.

**Chiffre obtenu : 0 campagne détectée**, sur 414 IP régionales connues et
43 160 textes publics examinés (26 259 titres d'événements et 16 901 indices
de revendication). Aucun de ces textes ne décrit explicitement un balayage
massif contre une IP de la région ; le détecteur est opérationnel et validé,
le corpus réel ne contient simplement pas ce signal à ce jour.

## Commande reproductible

Mesure en lecture seule (aucune écriture en base, aucun appel réseau sortant) :

```bash
DATABASE_URL='postgres://radar:radar@localhost:5433/radar' \
  pnpm measure:scan-campaigns --json=bench/results/scan-campaigns-na-2026-11-22.json
# → NA mass-scan campaigns from public sources: 0
```

La même mesure est disponible sans écriture de fichier via
`GET /api/scan/campaigns` (code et réponse en anglais). Les preuves
détaillées — compteurs, motifs, SQL, source de chaque signal — sont dans
`bench/results/scan-campaigns-na-2026-11-22.json`.

Durée mesurée de la commande : **1,03 s** (limite : 60 s). Les tests ciblés
s'exécutent en 2 s et la vérification de types en 10 s.

## État de départ réel

| Élément | Valeur |
| --- | ---: |
| Organisations | 1 673 151 |
| Sources publiques | 312 |
| Événements | 26 259 |
| Indices de revendication | 16 901 |
| IP NA issues de Shodan InternetDB (consultation gratuite) | 107 |
| IP NA issues du DNS passif public | 379 |
| Périmètre IP NA union | 414 |
| Textes publics filtrés par le motif de scan | 0 |
| Campagnes reconstruites | **0** |

Les IP régionales proviennent de deux sources publiques déjà présentes dans
l'état réel : le relevé Shodan InternetDB (120 IP interrogées, 107 IP publiques
union, 142 organisations, 768 services) et les enregistrements A du capteur
DNS passif. Le recouvrement entre les deux est dédupliqué.

## Méthode par étapes testables

1. **Périmètre IP** — seules les IP publiques routables, sans plage privée,
   loopback, lien local ou CGNAT, peuvent être cibles. Une IP entre dans le
   périmètre par une observation publique préalable (InternetDB ou DNS passif).
2. **Signal public** — un titre d'événement ou un indice de revendication doit
   nommer explicitement une action de scan (port scan, mass scan, campagne de
   balayage, masscan, zmap, nmap suivi d'un scan), une adresse IPv4 publique et
   une attribution régionale : IP du périmètre ou localité de Nouvelle-
   Aquitaine dans le même texte. Un lieu étranger annule l'attribution. Les
   titres CVE et les noms de produits (« QR Code Scanner ») sont écartés.
3. **Campagne** — deux sources publiques distinctes au minimum, visant le même
   /24, dans une fenêtre glissante de 30 jours. Une source unique reste une
   observation. Les doublons même source/IP/jour sont fusionnés.
4. **Anonymisation** — e-mails et numéros de téléphone sont retirés avant
   classification ; la sortie ne contient que identifiants, noms de sources,
   adresses IP, horodatages et motif de rattachement. Aucun titre, corps
   TLP:RED ni nom de victime n'est lu ou publié.

Un test par comportement observable : 13 tests dans
`apps/api/test/scan-campaigns.test.ts` (extraction, filtres, localité,
périmètre, déduplication, regroupement, fenêtre, source grise, mesure base et
route HTTP). Les 11 tests de couverture des règles d'accès restent verts.

## Contraintes respectées

- Périmètre : Nouvelle-Aquitaine uniquement ; aucune IP hors région n'est
  comptée. Sources grises (ransomware, fuites, onion, Telegram, presse) autorisées
  et inchangées ; aucune source payante, aucun appel réseau du détecteur.
- Aucune donnée personnelle de victime : seules des métadonnées réseau publiques
  et des identifiants de sources sortent de la mesure.
- Code et interface en anglais (`src/scan/detect.ts`, `src/scan/measure.ts`,
  route, tests, script de mesure) ; rapport en français.
- `apps/api/src/server.ts` inchangé (diff : 0 ligne) : la route est enregistrée
  dans le registre unique `routes/index.ts` et sa règle d'accès publique dans
  `security/rbac.ts`.
- Vérifications exécutées : 13/13 tests ciblés, 11/11 tests de sécurité des
  routes, typecheck sans erreur, mesure reproductible ci-dessus.

## Limites assumées

Le chiffre 0 mesure l'absence de *preuve publique* dans le corpus au 22
novembre 2026, pas l'absence de scans sur le terrain. Les journaux de scan
privés ou les capteurs non publics ne sont pas accessibles sans service payant
ou Accès privilégié ; ils sont donc exclus par construction. Le détecteur
réagit immédiatement à l'apparition d'un tel signal public : les tests de
regroupement et la mesure sur base de test en apportent la preuve.
