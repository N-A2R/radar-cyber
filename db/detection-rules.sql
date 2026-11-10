-- Règles de détection — réécrites le 2026-11-10.
--
-- Pourquoi cette réécriture : les premières règles étaient écrites pour une
-- taxonomie imaginaire (`assertion_type: vulnerability|claim|observation`,
-- `min_confidence: 0.6`), donc elles ne correspondaient à rien en base.
-- La taxonomie réelle (mesurée le 2026-11-10) est :
--   family          : vuln | cti | cert_fr | cert | ransomware | presse
--   assertion_type  : ambient_signal | technical_indicator | confirmed_incident | third_party_claim
--   confidence      : A1 | A2 | B2 | C3   (rang 4/3/2/1, voir detect/engine.ts)
--
-- Volumes mesurés sur les données réelles au moment de l'écriture :
--   incident confirmed_incident ........ 108
--   ransomware third_party_claim ...... 101
--   avis cert_fr ...................... 160
--   certificats cert ................. 18
--   presse cyber ..................... 58
--   fuite de données (cti + mots) .... 1
--   opérateur critique visé .......... 0 (en attente de corrélation org)
--
-- Objectif : une file de tri de quelques centaines d'alertes, pas des milliers.

DELETE FROM alert;
DELETE FROM detection_rule;

INSERT INTO detection_rule (id, name, description, severity, enabled, match, action) VALUES
('ransomware-revendication', 'Rançongiciel revendiqué',
 'Revendication de rançongiciel (revendication tierce, TLP:RED en quarantaine)',
 5, true, '{"family":"ransomware","assertion_type":"third_party_claim"}', 'alert'),

('incident-confirme', 'Incident confirmé',
 'Événement classé incident confirmé (CVE exploitée, intrusion avérée)',
 4, true, '{"assertion_type":"confirmed_incident"}', 'alert'),

('fuite-donnees', 'Fuite de données',
 'Fuite, exfiltration ou publication de données mentionnée dans un événement CTI',
 4, true, '{"family":"cti","keywords":{"any":["fuite","données","donnees","leak","exfiltration","piriat"]}}', 'alert'),

('avis-cert-fr', 'Avis CERT-FR',
 'Avis ou alerte publié par le CERT-FR (référence nationale)',
 3, true, '{"family":"cert_fr"}', 'alert'),

('certificat-observé', 'Certificat observé',
 'Certificat TLS observé sur un domaine (transparence des certificats)',
 3, true, '{"family":"cert"}', 'alert'),

('presse-cyber', 'Presse cyber',
 'Article de presse traitant d''un sujet cyber',
 2, true, '{"family":"presse"}', 'alert'),

('operateur-critique-vise', 'Opérateur critique visé',
 'Événement rattaché à un opérateur d''importance vitale (se déclenche quand la corrélation org est effective)',
 5, true, '{"org_kind":"operateur critique"}', 'alert');
