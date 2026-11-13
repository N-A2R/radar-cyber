-- 037 : presse cyber ciblée — Google News par thème et par département.
--
-- Constat du 14 novembre 2026, mesuré sur une base neuve (D0) : les flux RSS
-- généralistes sont lus mais ne produisent **aucun** événement. France 3 NA,
-- Sud Ouest Gironde et Pyrénées-Atlantiques ont rendu 70 items et 0 retenu :
-- un fil d'actualité généraliste ne contient pas d'incident cyber au moment du
-- passage. Le collecteur n'était donc pas en cause, la source l'était.
--
-- Les flux ci-dessous interrogent Google News avec un mot-clé cyber et un
-- périmètre géographique. Mesure du 14/11/2026 : 12 flux départementaux
-- activés, 200 événements presse admis, et le premier rattachement réel
-- (« Préfecture de la Gironde, mairie de Bordeaux » → Commune de Bordeaux).
--
-- `when:30d` borne la fenêtre : sans lui, Google renvoie des archives anciennes
-- que le contrat d'admission refuse ensuite, pour rien.

INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser) VALUES
 ('gn-cyber-na', 'Google News — « cyberattaque Nouvelle-Aquitaine »', 'presse_cyber', 'https://news.google.com/rss/search?q=cyberattaque+Nouvelle-Aquitaine+when:7d&hl=fr&gl=FR&ceid=FR:fr', 'Presse — citation courte', true, 'narrative', 'rss', '{}'),
 ('gn-ransom-aquitaine', 'Google News — « ransomware Aquitaine »', 'presse_cyber', 'https://news.google.com/rss/search?q=rancongiciel+(Gironde+OR+Dordogne+OR+Landes+OR+Pyr%C3%A9n%C3%A9es-Atlantiques)+when:7d&hl=fr&gl=FR&ceid=FR:fr', 'Presse — citation courte', true, 'narrative', 'rss', '{}'),
 ('gn-fuite-metropoles', 'Google News — « fuite de données » métropoles NA', 'presse_cyber', 'https://news.google.com/rss/search?q=%22fuite+de+donn%C3%A9es%22+(Bordeaux+OR+Limoges+OR+Poitiers+OR+%22La+Rochelle%22+OR+Pau)+when:7d&hl=fr&gl=FR&ceid=FR:fr', 'Presse — citation courte', true, 'narrative', 'rss', '{}'),
 ('gn-mairie-cyber', 'Google News — « cyberattaque mairie »', 'presse_cyber', 'https://news.google.com/rss/search?q=cyberattaque+(mairie+OR+communaut%C3%A9+de+communes)+when:7d&hl=fr&gl=FR&ceid=FR:fr', 'Presse — citation courte', true, 'narrative', 'rss', '{}'),
 ('gn-16', 'Google News — cyber Charente (30 j)', 'presse_cyber', 'https://news.google.com/rss/search?q=(cyberattaque+OR+piratage+OR+ran%C3%A7ongiciel)+Charente+when:30d&hl=fr&gl=FR&ceid=FR:fr', 'Presse — citation courte', true, 'narrative', 'rss', '{}'),
 ('gn-17', 'Google News — cyber Charente-Maritime (30 j)', 'presse_cyber', 'https://news.google.com/rss/search?q=(cyberattaque+OR+piratage+OR+ran%C3%A7ongiciel)+Charente-Maritime+when:30d&hl=fr&gl=FR&ceid=FR:fr', 'Presse — citation courte', true, 'narrative', 'rss', '{}'),
 ('gn-19', 'Google News — cyber Corrèze (30 j)', 'presse_cyber', 'https://news.google.com/rss/search?q=(cyberattaque+OR+piratage+OR+ran%C3%A7ongiciel)+Corrèze+when:30d&hl=fr&gl=FR&ceid=FR:fr', 'Presse — citation courte', true, 'narrative', 'rss', '{}'),
 ('gn-23', 'Google News — cyber Creuse (30 j)', 'presse_cyber', 'https://news.google.com/rss/search?q=(cyberattaque+OR+piratage+OR+ran%C3%A7ongiciel)+Creuse+when:30d&hl=fr&gl=FR&ceid=FR:fr', 'Presse — citation courte', true, 'narrative', 'rss', '{}'),
 ('gn-24', 'Google News — cyber Dordogne (30 j)', 'presse_cyber', 'https://news.google.com/rss/search?q=(cyberattaque+OR+piratage+OR+ran%C3%A7ongiciel)+Dordogne+when:30d&hl=fr&gl=FR&ceid=FR:fr', 'Presse — citation courte', true, 'narrative', 'rss', '{}'),
 ('gn-33', 'Google News — cyber Gironde (30 j)', 'presse_cyber', 'https://news.google.com/rss/search?q=(cyberattaque+OR+piratage+OR+ran%C3%A7ongiciel)+Gironde+when:30d&hl=fr&gl=FR&ceid=FR:fr', 'Presse — citation courte', true, 'narrative', 'rss', '{}'),
 ('gn-40', 'Google News — cyber Landes (30 j)', 'presse_cyber', 'https://news.google.com/rss/search?q=(cyberattaque+OR+piratage+OR+ran%C3%A7ongiciel)+Landes+when:30d&hl=fr&gl=FR&ceid=FR:fr', 'Presse — citation courte', true, 'narrative', 'rss', '{}'),
 ('gn-47', 'Google News — cyber Lot-et-Garonne (30 j)', 'presse_cyber', 'https://news.google.com/rss/search?q=(cyberattaque+OR+piratage+OR+ran%C3%A7ongiciel)+Lot-et-Garonne+when:30d&hl=fr&gl=FR&ceid=FR:fr', 'Presse — citation courte', true, 'narrative', 'rss', '{}'),
 ('gn-64', 'Google News — cyber Pyrénées-Atlantiques (30 j)', 'presse_cyber', 'https://news.google.com/rss/search?q=(cyberattaque+OR+piratage+OR+ran%C3%A7ongiciel)+Pyrénées-Atlantiques+when:30d&hl=fr&gl=FR&ceid=FR:fr', 'Presse — citation courte', true, 'narrative', 'rss', '{}'),
 ('gn-79', 'Google News — cyber Deux-Sèvres (30 j)', 'presse_cyber', 'https://news.google.com/rss/search?q=(cyberattaque+OR+piratage+OR+ran%C3%A7ongiciel)+Deux-Sèvres+when:30d&hl=fr&gl=FR&ceid=FR:fr', 'Presse — citation courte', true, 'narrative', 'rss', '{}'),
 ('gn-86', 'Google News — cyber Vienne (30 j)', 'presse_cyber', 'https://news.google.com/rss/search?q=(cyberattaque+OR+piratage+OR+ran%C3%A7ongiciel)+Vienne+when:30d&hl=fr&gl=FR&ceid=FR:fr', 'Presse — citation courte', true, 'narrative', 'rss', '{}'),
 ('gn-87', 'Google News — cyber Haute-Vienne (30 j)', 'presse_cyber', 'https://news.google.com/rss/search?q=(cyberattaque+OR+piratage+OR+ran%C3%A7ongiciel)+Haute-Vienne+when:30d&hl=fr&gl=FR&ceid=FR:fr', 'Presse — citation courte', true, 'narrative', 'rss', '{}')
ON CONFLICT (id) DO UPDATE
   SET url = EXCLUDED.url,
       enabled = EXCLUDED.enabled,
       name = EXCLUDED.name;

