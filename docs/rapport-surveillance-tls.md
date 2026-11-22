# Surveillance TLS — changements de certificat suspects en Nouvelle-Aquitaine

**Mesure du 22 novembre 2026 : 16 alertes émises, dont 9 confirmées et 7 faux positifs, soit un taux de faux positifs de 43,8 %.**

Résultat versionné : `bench/results/tls-monitor-na-2026-11-22.json`.
Commande reproductible : `pnpm mesure:tls-monitor` (rejeu hors ligne, 0,3 s observées, aucune dépendance réseau ni base de données).

## État réel de départ

La base locale interrogée contient **1 673 151 organisations**, **312 sources** et **26 259 événements** dans `event` (4 710 autres dans `event_archive`, soit environ 31 000 événements conservés). Le détecteur n'utilise aucune donnée personnelle de victime : il ne lit que des domaines publics d'organisations et des métadonnées de certificats.

Le référentiel de référence est l'inventaire CT du 21 novembre 2026 (`bench/results/ctlogs-inventaire-2026-11-21.json`, empreinte SHA-256 `3d822086e341ecaed32fd7f327a46e002fac000c7024bef465919ec87c3a8a3f`) : **342 sous-domaines**, **9 domaines**, **9 organisations** de Nouvelle-Aquitaine, avec identifiant de certificat, émetteur et première vue CT. Ces données proviennent des journaux CT publics `crt.sh` et Cert Spotter, sources grises autorisées et gratuites.

Un second relevé a été effectué le 22 novembre 2026 par poignée de main TLS directe (`bench/results/tls-monitor-snapshot-2026-11-22.json`) : **30 hôtes ciblés**, **20 observations exploitables**, 10 hôtes injoignables, **23,6 s** de collecte. La commande de rafraîchissement `pnpm snapshot:tls-monitor` est bornée à 30 s de sondage plus les délais en vol ; l'exécution observée est restée sous les 60 s.

## Règles de détection

Le module pur `apps/api/src/tlsMonitor/detection.ts` ne fait ni réseau ni horloge. Pour chaque hôte connu de l'inventaire CT et effectivement observé, une alerte est émise si au moins une règle s'applique :

| Règle | Condition | Alertes |
| --- | --- | ---: |
| `issuer_change` | L'organisation émettrice diffère de celle du certificat CT de référence (alias normalisés : Let's Encrypt, Gandi, DigiCert…) | 12 |
| `new_ca_for_domain` | L'émetteur actuel n'apparaît dans aucun certificat de référence du même domaine | 6 |
| `identity_mismatch` | SAN/CN ne couvre pas l'hôte, chaîne non approuvée, certificat auto-signé ou expiré | 9 |

Une seule alerte par hôte : les règles se cumulent dans le champ `rules`. Les renouvellements par le même émetteur sont volontairement silencieux. **Total : 16 alertes** (les comptes par règle se chevauchent).

## Résultat et revue

Les 16 alertes ont été examinées une par une ; les verdicts sont versionnés dans `bench/results/tls-monitor-verdicts.json` avec la preuve utilisée (SAN, date d'expiration, état de la chaîne, ancienneté de l'émetteur CT).

- **9 vraies alertes** : certificat dont le SAN n'authentifie pas l'hôte public (par exemple un certificat `*.anglet.fr` présenté pour `www.biennale.anglet.fr`, ou un certificat `*.mapado.com` pour la billetterie de Bouscat) ou certificat expiré (dates butoirs 2023-05-03, 2024-09-19 et 2026-08-09 observées). Dans ces neuf cas, la chaîne TLS est rejetée par le client.
- **7 faux positifs** : migration légitime d'autorité de certification avec certificat valide, SAN correct et chaîne approuvée (VeriSign → DigiCert sur `www.bordeaux.fr`, Thawte → Gandi sur `www.bayonne.fr`, GeoTrust → Let's Encrypt sur `www.angouleme.fr`, etc.). L'inventaire CT ne conservait que l'émetteur du certificat le plus ancien, parfois de 2006, ce qui fait apparaître toute migration comme un changement.
- **Taux de faux positifs : 7 / 16 = 43,8 %** (calculé sur les seules alertes classées, jamais sur 0/0).

## Contrôles et contraintes

- 12 tests de comportement (`apps/api/test/tls-monitor.test.ts`) passent hors réseau : normalisation des émetteurs, contrôle SAN/wildcard/CN, lecture de l'inventaire CT, renouvellement silencieux, changement d'émetteur, nouvelle autorité, SAN invalide, expiration, auto-signature, chaîne non approuvée, échec de sonde, cumul des règles, taux de faux positifs.
- `tsc --noEmit -p apps/api/tsconfig.json` : propre.
- Périmètre Nouvelle-Aquitaine uniquement ; seuls les 9 domaines de l'inventaire CT régional sont surveillés. Sources grises (journaux CT publics) autorisées ; aucun service payant ; aucune donnée personnelle de victime.
- Code, scripts, tests et sorties de console en anglais ; présent rapport en français.
- **Aucune modification de `apps/api/src/server.ts` (diff : 0 ligne)** : la mesure est un rejeu de fichiers versionnés, sans nouvelle route.
- Aucune commande de plus de 60 s : rejeu 0,3 s, collecte 23,6 s, tests 1,1 s, typecheck 5,9 s.

## Limites

Vingt hôtes seulement ont répondu sur trente ; les hôtes en échec de sonde ne produisent pas d'alerte (absence de preuve, pas de silence impartial). L'inventaire CT ne garde qu'une vue par hôte, si bien que la « référence » peut être un certificat vieux de plusieurs années : le détecteur mesure un changement par rapport à cette référence, pas une rotation observée en continu. Un second relevé CT avec plusieurs certificats par hôte permettrait de réduire la part des migrations benignes classées à tort comme suspectes.
