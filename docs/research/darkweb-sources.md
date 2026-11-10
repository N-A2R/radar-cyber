# Sources dark web / leak sites — catalogue vérifié (2026-11-10)

Périmètre : sources de **revendications** (claims) accessibles **en clair ou via API**.
Chaque URL ci-dessous a été contactée le 2026-11-10 ; code HTTP mesuré, licence lue.
`.onion` : **non vérifiables** (pas de Tor fonctionnel sur la box — bootstrap bloqué à 5 %). Aucune URL .onion n'a été contactée.

## 1. Dépôts GitHub évalués

| Dépôt | URL | Étoiles | Dernier commit | Licence | Verdict |
|---|---|---|---|---|---|
| joshhighet/ransomwatch | https://github.com/joshhighet/ransomwatch | 1115 | 2026-03-03 (repo) / **2025-06-17 pour posts.json** (« 𝚌𝚛𝚘𝚗𝚋𝚘𝚝 », puis plus rien) | Unlicense | **ADAPTER** — dataset historique de 16 072 claims (clés `post_title`, `group_name`, `discovered`) parfait pour backfill, mais le cron est arrêté depuis juin 2025 : source morte en temps réel, à réutiliser comme corpus historique uniquement. |
| RansomLook/RansomLook | https://github.com/RansomLook/RansomLook | 685 | 2026-11-05 (actif) | GPL-3.0 | **ADAPTER** — scrape les DLS + Telegram ; GPL-3.0 **contaminante** : on ne copie pas le code dans radar-cyber, on s'inspire des parsers et on consomme l'instance publique https://ransomlook.io/ (HTTP 200, ToS à vérifier avant usage automatisé). |
| captainGeech42/ransomwatch | https://github.com/captainGeech42/ransomwatch | 309 | 2022-03-07 (abandonné) | MIT | **ÉVITER** — 4 ans sans commit ; architecture scrapers Selenium obsolète face aux protections actuelles des DLS. |
| cyberiskvision/dls-monitor | https://github.com/cyberiskvision/dls-monitor | 32 | 2026-11-07 (actif) | MIT | **RÉUTILISER** (comme référence de parsing) — « scan public Data Leak Sites », maintenu, MIT non contaminant. README absent du path `README.md` (404 API contents le 2026-11-10) : lire `docs/` avant intégration. |
| v0idsnail/gjallarhorn | https://github.com/v0idsnail/gjallarhorn | 2 | 2026-11-02 (actif) | MIT | **RÉUTILISER** (conception) — wall display « claims, not verdicts », zéro-egress, corrige la donnée ransomware.live avec une 2ᵉ feed avant affichage : exactement notre posture de quarantaine. MIT couvre le **code uniquement** ; les données ransomware.live restent soumises aux T&C de ransomware.live. |
| Chill-Ethical-People/ExtortSignal | https://github.com/Chill-Ethical-People/ExtortSignal | 0 | 2026-10-29 | Apache-2.0 | **ÉVITER** — 0 étoile, historique trop court pour juger la robustesse des parsers. |
| Anugrahkv/dark-web-monitor | https://github.com/Anugrahkv/dark-web-monitor | 0 | 2026-11-06 | aucune | **ÉVITER** — sans licence = pas de droit de réutilisation ; 0 étoile. |

Recherches exécutées : `search/repositories` avec `ransomware leak tracker`, `ransomwatch`, `darknet leak site monitor`, `ransomware claims`, `ransomware scraper`, `leak site scraper`. Les scrapers « leak site scraper » trouvés sont soit 0 étoile sans licence, soit hors sujet (ososedki_dl = scraper de galeries, GPL-3.0) : aucun retenu.

## 2. APIs et pages en clair

### 2.1 ransomware.live (Julien Mousqueton) — source primaire

| Endpoint (GET) | Code mesuré | Contenu | Fréquence |
|---|---|---|---|
| https://api.ransomware.live/v2/recentvictims | **200** (~73 Ko) | JSON array de victimes : `activity`, `attackdate`, `claim_url` (.onion), `country`, `data_size`, `description`, `discovered`, `domain`, `group`, `press`, `ransom`, `screenshot`, `url` | cache ~30 min |
| https://api.ransomware.live/v2/groups | **200** (429 « 1 per 1 minute » si >1 req/min) | JSON array de 421 groupes : `added_date`, `altname`, `description`, `locations`, `name`, `tools`, `ttps`, `url` | rate limit 1 req/min |
| https://api.ransomware.live/v2/allcyberattacks | 302→v2 (parent : 200 en GET) | attaques tous types | idem |
| https://www.ransomware.live/api (doc) | **200** | page de documentation des endpoints v2 | — |
| https://www.ransomware.live/t&c (ToS) | **200** | conditions d'utilisation | — |

**Licence/ToS** (lues via le README de gjallarhorn qui les résume, page t&c en ligne) : attribution obligatoire avec lien ; **interdiction de republier les données brutes** ; interdiction de re-servir les données comme API ; pas d'usage commercial sans accord écrit ; poll ≤ 1 fois / 30 min. **Conséquence radar-cyber** : on stocke les claims en interne, on n'expose jamais ces données via notre API publique, attribution dans le footer.

**Mapping vers notre schéma** :

| Notre champ | Source |
|---|---|
| `org` | `domain` (si vide → `post_title` nettoyé, à qualifier en quarantaine) |
| `groupe` | `group` |
| `date` | `discovered` (UTC) |
| `secteur` | `activity` (à normaliser vers notre taxonomie) |
| `source_url` | `url` (page ransomware.live, pas le .onion) |
| `sha256` | sha256 de `domain + group + discovered` (clé de dédup) |

### 2.2 ransomwatch (posts.json) — backfill historique

- URL : https://raw.githubusercontent.com/joshhighet/ransomwatch/main/posts.json → **HTTP 200** (2026-11-10).
- Format : JSON array, **16 072 entrées**, clés exactes : `post_title` (string), `group_name` (string, lowercase), `discovered` (string `YYYY-MM-DD HH:MM:SS.000000`).
- Fréquence : commits « cronbot » toutes les ~4-6 h jusqu'au **2025-06-17**, puis arrêt. Repo a encore un commit 2026-03-03 (suppression CNAME) mais **posts.json n'est plus mis à jour**.
- Licence : Unlicense (domaine public).
- Usage : charge initiale historique uniquement ; pas de polling.

Mapping : `post_title`→`org` (à qualifier), `group_name`→`groupe`, `discovered`→`date`, URL du post GitHub comme `source_url` (pas de claim_url par victime dans ce fichier).

### 2.3 RansomLook (instance publique)

- Site : https://ransomlook.io/ → **HTTP 200**. Dépôt : GPL-3.0, actif (2026-11-05).
- Sortie du projet : pages markdown de chaque groupe + `posts.json` dans le dépôt. Pas d'API publique documentée vérifiée aujourd'hui → **NON VÉRIFIÉ** pour un endpoint API dédié.
- Usage : poll de l'instance publique avec rate limit poli, ou auto-hébergement du parser (attention GPL-3.0 si on copie du code → on ne copie pas).

### 2.4 dark.fail

- https://dark.fail/ → **HTTP 200** (2026-11-10). Page statique sans JS listant le statut (up/down) de sites .onion et canaux.
- Licence : aucune sur le site ; ToS non explicités → **NON VÉRIFIÉ**. Données = statuts, pas de claims victimes. **Verdict : ÉVITER** comme source de données (valeur faible, pas de licence), garder en référence humaine.

### 2.5 Canaux Telegram publics via t.me/s/

Test du 2026-11-10 (HTML servi sans JS) :

| URL | Code | Résultat |
|---|---|---|
| https://t.me/s/leaksite | 200 | HTML lisible sans JS, blocs `tgme_widget_message_text` présents (1 message, canal quasi vide) |
| https://t.me/s/RansomWareNews | 200 | page « canal inexistant / sans posts » (~9,7 Ko, 0 bloc message) |
| https://t.me/s/darkwebdotcom | 200 | idem, 0 bloc message |
| https://t.me/s/ransomwatch | 200 | idem, 0 bloc message |
| https://t.me/s/darkwebinformer, /RansomwareLive, /RansomwareNews, /ransomwareleaks | 302 | redirection (preview désactivée ou canal inexistant) |

Conclusion : **t.me/s/<canal> est techniquement lisible sans JS** (HTML statique avec blocs `tgme_widget_message_text`), mais la preview est désactivable par canal et la plupart des canaux CTI connus la désactivent ou n'existent pas sous ces noms. Verdict : **ADAPTER** — collecteur générique t.me/s à faible priorité, en complément de RansomLook qui surveille déjà les canaux ; ne pas scraper via l'API Bot (nécessite appartenance).

## 3. Conception de la quarantaine

Principe : **tout claim dark web atterrit en quarantaine, jamais directement dans event/indicator.** Promotion = décision humaine tracée.

```sql
-- quarantine_raw : contenu brut des revendications dark web, avant qualification.
-- Copiable tel quel (tester : BEGIN; \i quarantine_raw.sql; ROLLBACK;)

CREATE TABLE IF NOT EXISTS quarantine_raw (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source        text        NOT NULL,           -- 'ransomware.live' | 'ransomwatch' | 'ransomlook' | 'telegram' | ...
    source_url    text        NOT NULL,           -- URL en clair de la source (jamais le .onion)
    groupe        text,                           -- nom du groupe tel que revendiqué
    org_hint      text,                           -- victime telle que revendiquée, NON qualifiée
    claimed_at    timestamptz,                    -- date de la revendication selon la source
    extracted     jsonb        NOT NULL DEFAULT '{}'::jsonb,  -- extrait structuré : titre, secteur brut, pays...
    raw_body      text,                           -- contenu brut (texte extrait, JAMAIS dump de données)
    tlp           text        NOT NULL DEFAULT 'RED',
    content_hash  text        NOT NULL,           -- sha256 hex de (source, source_url, org_hint, claimed_at)
    status        text        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','reviewed','promoted','rejected','purged')),
    promoted      boolean     NOT NULL DEFAULT false,
    promoted_at   timestamptz,
    promoted_by   text,
    received_at   timestamptz NOT NULL DEFAULT now(),
    purge_after   timestamptz NOT NULL DEFAULT now() + interval '30 days',
    CONSTRAINT quarantine_raw_source_url_key UNIQUE (source, content_hash)
);

-- Dédup rapide au collecteur : un même claim re-pollé ne crée pas de doublon.
CREATE UNIQUE INDEX IF NOT EXISTS quarantine_raw_dedup_idx
    ON quarantine_raw (source, content_hash);

-- File de travail : les claims en attente de revue humaine.
CREATE INDEX IF NOT EXISTS quarantine_raw_pending_idx
    ON quarantine_raw (received_at)
    WHERE status = 'pending' AND promoted = false;

-- Purge : ne scanner que ce qui est expirable.
CREATE INDEX IF NOT EXISTS quarantine_raw_purge_idx
    ON quarantine_raw (purge_after)
    WHERE status IN ('pending','rejected','purged') AND promoted = false;

-- Contrainte de cohérence : promotion ⇒ statut et traçabilité renseignés.
ALTER TABLE quarantine_raw
    ADD CONSTRAINT quarantine_raw_promotion_check
    CHECK (promoted = false OR (promoted_at IS NOT NULL AND promoted_by IS NOT NULL AND status = 'promoted'));
```

**Règle écrite (inviolable)** : aucun `INSERT` dans `event` ou `indicator` à partir d'une source dark web sans `UPDATE quarantine_raw SET promoted = true, promoted_at = now(), promoted_by = '<opérateur>', status = 'promoted'` préalable, après validation manuelle. Le job de promotion lit exclusivement les lignes `promoted = true AND status = 'promoted'` et journalise `id` de quarantaine dans l'événement créé.

**Politique de purge** : `purge_after = received_at + 30 jours` par défaut. Job quotidien : `DELETE FROM quarantine_raw WHERE purge_after < now() AND promoted = false` (les lignes promues sont conservées comme preuve de traçabilité ; les rejetées passent `status='purged'` puis sont supprimées). Extension possible à 90 j pour les lignes `reviewed` non tranchées.

**Explicitement interdit de stocker** :
- le contenu des **dumps de données exfiltrées** (archives, échantillons de fichiers, bases victimes) — on ne stocke que le *texte de la revendication* ;
- **données personnelles** présentes dans les titres/extraits (noms d'individus, emails, téléphones) → champ `raw_body` rédigeable, toute donnée perso détectée est masquée à l'ingestion ;
- les **URLs .onion complètes** comme données opérationnelles consultables (le `claim_url` est stocké haché ou omis ; jamais de connexion vers .onion depuis l'infra radar-cyber) ;
- captures d'écran des DLS (droits + contenu non maîtrisé) ;
- clés/vault de déchiffrement, negotiateurs, contacts de groupes.

## 4. Ce qu'on ne fait pas

1. **Aucun accès .onion** : Tor est non fonctionnel sur la box (bootstrap 5 %). Toute donnée .onion provient d'une source en clair (ransomware.live, ransomwatch, RansomLook). On ne déploie pas de proxy Tor tant que l'egress n'est pas corrigé, et jamais depuis l'infra de production.
2. **Pas de téléchargement de dumps** : ni archives de données exfiltrées, ni échantillons, ni preuve de vol. Le collecteur s'arrête au texte de la page de revendication.
3. **Pas de données personnelles** : noms d'employés, emails, CV, pièces d'identité mentionnés dans les leaks ne sont jamais stockés ni indexés.
4. **Pas de contenu chiffré / rançon** : notes de rançon, échantillons de malware, binaires : hors périmètre (relève abuse.ch déjà en place).
5. **Pas de republication** des données ransomware.live (T&C) : usage interne, attribution conservée, pas d'API exposée.
6. **Pas de contact avec les groupes** : aucun accès aux négociateurs, chats de support de leak, ou formulaires de victimes.

## 5. Harvest du 2026-11-10 (chantier 2)

Périmètre : élargir la couverture « sites, canaux, actus, revendications ». Toutes les URLs ci-dessous ont été mesurées par `curl` le 2026-11-10 (code HTTP + taille). Aucun `.onion` retenu.

### 5.1 Méthode

- **Sites de fuite** : `https://www.ransomlook.io/urls.csv` (HTTP 200, 458 585 o) — index de 4 072 entrées (marchés + groupes) avec statut. Filtre `Type=group` + URL sans `.onion`/`.i2p` → 165 candidats, 116 « online ». Chaque candidat a été re-vérifié par `curl` (code + taille + contenu).
- **Canaux Telegram** : listes `fastfire/deepdarkCTI` (`telegram_threat_actors.md`, `telegram_infostealer.md`, `ransomware_gang.md`) → 988 identifiants uniques testés via `https://t.me/s/<canal>` (code HTTP + nombre de blocs `tgme_widget_message_text` + extrait).
- **Trackers / actus** : candidats issus de la doc et de recherches web, vérifiés un par un.

### 5.2 Sites de fuite des rançongiciels — retenus (7)

| Source | URL | HTTP | Taille | Contenu |
|---|---|---|---|---|
| NetLeaks (Bjorka) | https://netleaks.net/ | 200 | 10 733 | page de revendication, bases à vendre |
| AntiBrok3rs | https://antibrok3rs.bearblog.dev/ | 200 | 10 165 | blog « Leaking the Leakers » |
| LAPSUS$ | https://lapsus.ar.io | 200 | 14 987 | déclaration PGP du groupe |
| FulcrumSec | https://fulcrumsec.vg/ | 200 | 13 246 | index de victimes |
| Soul Group | https://codice-ledger.io/ | 200 | 10 118 | annuaire de victimes |
| Cyber Toufan | https://toufanleaks.org/ | 200 | 45 813 | blog de fuite |
| Leaked Data | https://business-data-leaks.com | 200 | 3 222 | publication de fuites |

### 5.3 Sites écartés (extrait)

| URL | HTTP | Pourquoi |
|---|---|---|
| https://www.lockbitblog.com/ | 000 | domaine mort |
| https://lockbitblog.com/ | 000 | domaine mort |
| https://www.lockbitblog.info/ | 000 | domaine mort |
| https://lynxblog.net/ | 000 | domaine mort |
| https://huntersinternational.net | 000 | domaine mort |
| https://squidrocket.net/ | 000 | domaine mort |
| https://www.ransomwhere.com/ | 403 | domaine parké (HugeDomains) |
| https://www.id-ransomware.malwarehunterteam.com/ | 000 | domaine mort |
| https://www.dls-monitor.com/ | 000 | domaine mort |
| https://leakbase.io/ | 000 | domaine mort |
| https://www.leakbase.cc/ | 200 | redirige vers un parking (ww38.leakbase.cc) |
| https://probiv.cc/ | 456 | bloqué (WAF) |
| https://karakurt.tech | 200 | page chinoise (site defacé) |
| https://karaleaks.com | 200 | redirige vers un clic-par-pub |
| https://darkrypt.io | 200 | redirige vers un domaine parké |
| https://normalhunters0x.surge.sh | 200 | « Chrome Dino Game » (defacé) |
| https://bjork.ai/ | 200 | page « for sale » |
| https://0mega.cc/ | 200 | page vide (« Do Not Sell or Share… ») |
| https://nasir.cc/ | 200 puis 000 | instable |
| https://homelandjustice.ru | 200 puis 000 | instable |
| https://www.ransomlook.io/urls.csv | 200 | contient des `.onion` → écarté comme source (utilisé comme référence de recherche) |
| https://dark.fail/ | 200 | pas de claims, pas de licence (déjà écarté §2.4) |

### 5.4 Canaux Telegram — retenus (10)

| Canal | URL | HTTP | Messages | Extrait |
|---|---|---|---|---|
| Leaked Databases | https://t.me/s/leaked_databases | 200 | 21 | « DEA Investigating Breach of Law Enforcement Data Portal » |
| Snatch Team | https://t.me/s/snatch_news | 200 | 20 | « Lootah Group data added 3.6 GB » |
| BaseLeak | https://t.me/s/baseleeak | 200 | 20 | « INCIDENT: TOASTTAB.COM … Ransomware group Clop » |
| BLACKNET-00 Ransomware | https://t.me/s/Ransomwareg | 200 | 11 | « We successfully hacked the government run NIKDU Institute and stole 483 GB » |
| Marketo Leaks | https://t.me/s/marketo_leaks | 200 | 20 | « The Brokerage Land Co 1Gb of data is uploaded » |
| CVE Notify | https://t.me/s/cveNotify | 200 | 20 | « CVE-2026-111822 … Apache ActiveMQ » |
| DarkFeedNews | https://t.me/s/DarkfeedNews | 200 | 20 | « New Threat Intelligence Alert! Malaysian Government Employee Records Containing PII Leaked » |
| IT Security Alerts | https://t.me/s/itsecalert | 200 | 19 | « Firefox Information Exposure » |
| APT Analysis | https://t.me/s/APTANALYSIS | 200 | 21 | « Threat Intelligence Report: APT35 Internal Leak » |
| TechPwnews | https://t.me/s/techpwnews | 200 | 20 | « A mistake in the bulletproofs paper could have led to the theft of millions » |

### 5.5 Canaux écartés (extrait)

- **Preview désactivée / canal vide** (HTTP 200, 0 message public) : `RansomwareLeaks`, `RansomwareLive`, `ransomwatch`, `CTI_Intel`, `cyberwarworld`, `darkwebinformer`, `LeakBase`, `sectest9`, `LeaksSite`, `darkwebdotcom`, `cyberthreatintel`, `feed_observer`, `IOC_Feed`, `threat_intelligence`…
- **« Channel created »** (pas de contenu public exploitable) : `breachstars`, `MalwareLogs`, `BreachForumsNews`, `leakbaseforum`, `ThreatSec`, `cybersecuritynews`, `CyberVeille`, `TheDFIRReport`, `LeakBase`, `DataLeakHome`, `milkdude`, `gulfdocs`, `hannibalmaaleaks`, `breachfiles`.
- **Hors sujet** : `DBleak` (déhashage payant), `breaches` (messagerie privée), `weleaklabs` (vente d’accès), `ThreatMarket` (bots), `naosbase`/`cybdetective` (outils de lookup, pas d’IOC).

### 5.6 Trackers et agrégateurs — retenus (7)

| Source | URL | HTTP | Taille | Format |
|---|---|---|---|---|
| Coveware ransomware feed | https://www.coveware.com/feed | 200 | 209 126 | RSS |
| No More Ransom | https://www.nomoreransom.org/ | 200 | 22 129 | HTML |
| Emsisoft decryption | https://www.emsisoft.com/en/ransomware-decryption/ | 200 | 189 597 | HTML |
| RansomLook Leaks | https://www.ransomlook.io/leaks | 200 | 1 790 783 | HTML |
| ICHI Adversary Ecosystem | https://ichi.global/ecosystem.html | 200 | 25 211 | HTML |
| SecurityAlert.ai Ransomware Tracker | https://securityalert.ai/ransomware | 200 | 48 367 | HTML |
| Binary Response Ransomware Groups | https://binary-response.com/threat-intel/ransomware-groups.html | 200 | 56 740 | HTML |

### 5.7 Actus — retenus (10)

| Source | URL | HTTP | Taille | Format |
|---|---|---|---|---|
| Cybersecurity Dive | https://www.cybersecuritydive.com/feeds/news/ | 200 | 8 206 | RSS |
| Infosecurity Magazine | https://www.infosecurity-magazine.com/rss/news/ | 200 | 132 135 | RSS |
| Help Net Security | https://www.helpnetsecurity.com/feed/ | 200 | 18 576 | RSS |
| Security Affairs | https://securityaffairs.co/wordpress/feed | 200 | 82 767 | RSS |
| IT Security Guru | https://www.itsecurityguru.org/feed/ | 200 | 157 702 | RSS |
| CyberNews | https://cybernews.com/feed/ | 200 | 27 541 | RSS |
| HackRead | https://www.hackread.com/feed/ | 200 | 11 580 | RSS |
| WeLiveSecurity (ESET) | https://www.welivesecurity.com/feed/ | 200 | 70 099 | RSS |
| CrowdStrike Blog | https://www.crowdstrike.com/blog/feed/ | 200 | 5 253 | RSS |
| ZDNet Security | https://www.zdnet.com/topic/security/rss.xml | 200 | 24 924 | Atom |

### 5.8 Actus écartés (extrait)

- `https://www.scmagazine.com/feed/` → 200 mais redirige vers `scworld.com` (pas un flux).
- `https://www.ibm.com/blogs/security/feed/` → 200 mais redirige vers une page HTML (pas un flux).
- `https://www.rapid7.com/blog/feed/` → 404 ; `https://www.bitdefender.com/blog/feed/` → 404.
- `https://www.mcafee.com/blogs/feed/` → 403 ; `https://www.cyberdefensemagazine.com/feed/` → 403.
- `https://www.bankinfosecurity.com/rss-feed` et `https://www.databreachtoday.com/rss-feed` → 403.
- `https://www.cybersecurity-insiders.com/feed/` → 500 ; `https://www.theregister.com/security/.rss` → 404.
- `https://www.enisa.europa.eu/rss.xml`, `https://www.first.org/feed/`, `https://www.cisa.gov/news-events/cybersecurity-advisories/rss` → 404.
- `https://www.threatpost.com/feed/` et `https://feeds.reuters.com/reuters/technologyNews` → 000 (domaine mort).

### 5.9 Intégration

- `db/darkweb-sources.sql` : 34 `INSERT … ON CONFLICT (id) DO NOTHING` → `SELECT count(*) FROM source` passe de **422 à 456**.
- 14 sources en `kind='quarantine'` (7 sites de fuite + 5 canaux de leaks + 2 agrégateurs de leaks) : à ne pas ingérer comme `event` direct. Le collecteur générique doit les exclure et un collecteur de quarantaine doit les lire.
- 20 sources en `kind='narrative'` (5 canaux CTI, 5 trackers, 10 actus) : ingestables par le moteur générique.
- Aucune URL `.onion` retenue ; `urls.csv` de RansomLook reste une référence de recherche, pas une source.
