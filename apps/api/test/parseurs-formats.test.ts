import { test } from "node:test";
import assert from "node:assert/strict";
import { detectItems } from "../src/collectors/generic.js";

/**
 * Extraits RÉELS (500 caractères) des corps reçus le 21 novembre 2026 par
 * `scripts/probe-red-sources.mts` : WhiteArmor, Telegram CERT_EU et Everest.
 * Trois sources classées « contenu non parsable » alors qu'elles répondaient
 * HTTP 200. Avant correctif : 0 item détecté sur chacun de ces extraits.
 */

const PAGE_ACCUEIL =
  "\" href=\"/\">WHITEARMOR</a>\n    </div>\n</header>\n\n<div class=\"notice\">\n    <p>Companies listed below w" +
  "ere contacted. If negotiations fail, data will be published here.</p>\n</div>\n\n<div class=\"container\"" +
  ">\n    <div class=\"list-head\">Publications</div>\n    <div class=\"grid\" id=\"grid\">\n        <div class=" +
  "\"empty\" id=\"empty\">Loading…</div>\n    </div>\n</div>\n\n<footer>\n    <div class=\"footer-inner\">\n       " +
  " <span>WhiteArmor</span>\n    </div>\n</footer>\n\n<script src=\"/common.js\"></script>\n<script src=\"/join";

const CONTACT_TELEGRAM =
  "        <div class=\"tgme_page_icon\">\n  <i class=\"tgme_icon_user\"></i>\n</div>\n<div class=\"tgme_page_d" +
  "escription\">\n  If you have <strong>Telegram</strong>, you can contact <a class=\"tgme_username_link\" " +
  "href=\"tg://resolve?domain=CERT_EU\">@CERT_EU</a> right away.\n</div>\n<div class=\"tgme_page_action\">\n  " +
  "<a class=\"tgme_action_button_new\" href=\"tg://resolve?domain=CERT_EU\">Send Message</a>\n</div>\n<!-- WE" +
  "BOGRAM_BTN -->\n<!-- PRIVACY_BTN -->\n        </div>\n        \n      </div>\n    </div>\n\n    <div id=\"tg";

const JSON_EMBARQUE =
  "\":null},\"categories\":[{\"id\":\"87\",\"slug\":\"grundbaulabor-trier-gmbh\",\"title\":\"Grundbaulabor Trier GmbH" +
  "\",\"image\":\"\\/storage\\/uploads\\/20261114\\/BKJh6tpNVAMiSHcJCNYykBLgcLRAy7iO4bBoN4mK.jpg\",\"opens\":10191" +
  ",\"postCount\":2,\"date\":\"Nov 14\",\"hue\":274,\"locked\":false},{\"id\":\"97\",\"slug\":\"alkf\",\"title\":\"ALKF\",\"im" +
  "age\":\"\\/storage\\/uploads\\/20261120\\/pFKooGs8wSCXDf4Zo6jEb6Fm3iAsAlcj0usqiNJ6.jpg\",\"opens\":1380,\"post" +
  "Count\":2,\"date\":\"17h\",\"hue\":166,\"locked\":false},{\"id\":\"96\",\"slug\":\"vizrt\",\"title\":\"Vizrt\",\"image\":\"\\";

test("page d'accueil HTML sans flux : l'annonce devient un item", () => {
  assert.equal(PAGE_ACCUEIL.length, 500);
  const detected = detectItems(PAGE_ACCUEIL, "text/html; charset=utf-8");
  assert.equal(detected.strategy, "landing-notice");
  assert.equal(detected.items.length, 1, "0 item avant correctif, 1 après");
  assert.match(String(detected.items[0]?.summary), /Companies listed below were contacted/);
});

test("page de contact Telegram : l'identité du compte devient un item", () => {
  assert.equal(CONTACT_TELEGRAM.length, 500);
  const detected = detectItems(CONTACT_TELEGRAM, "text/html; charset=utf-8");
  assert.equal(detected.strategy, "telegram-contact");
  assert.equal(detected.items.length, 1, "0 item avant correctif, 1 après");
  assert.equal(detected.items[0]?.title, "@CERT_EU");
  assert.equal(detected.items[0]?.link, "https://t.me/CERT_EU");
});

test("JSON embarqué tronqué dans du HTML : les objets complets sont extraits", () => {
  assert.equal(JSON_EMBARQUE.length, 500);
  const detected = detectItems(JSON_EMBARQUE, "text/html; charset=utf-8");
  assert.equal(detected.strategy, "embedded-json");
  assert.equal(detected.items.length, 2, "0 item avant correctif, 2 après (3e objet tronqué)");
  assert.deepEqual(detected.items.map((item) => item.title), ["Grundbaulabor Trier GmbH", "ALKF"]);
});
