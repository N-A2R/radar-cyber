#!/usr/bin/env node
import { closePools } from "../src/db.js";
import { isDeliveryConfigured, previewAlertDeliveries, readDeliveryConfig } from "../src/notify/alert-delivery.js";

const limitArg = Number(process.argv[2] ?? 3);
const limit = Number.isFinite(limitArg) && limitArg > 0 ? Math.trunc(limitArg) : 3;

const cfg = readDeliveryConfig();
const configured = isDeliveryConfigured(cfg);
console.log(`Canaux configurés : ${configured ? "oui" : "non (aperçu uniquement, aucun envoi)"}`);
if (cfg.webhookUrl) console.log("- webhook : configuré");
if (cfg.telegramBotToken && cfg.telegramChatId) console.log("- telegram : configuré");

const messages = await previewAlertDeliveries(limit, cfg);
if (messages.length === 0) {
  console.log("\nAucune alerte en attente de diffusion.");
} else {
  console.log(`\nAperçu dry-run — ${messages.length} message(s) qui seraient envoyés :\n`);
  for (const [i, msg] of messages.entries()) {
    console.log(`--- Message ${i + 1} (alerte #${msg.alertId}) ---`);
    console.log(msg.text);
    console.log("Payload JSON :");
    console.log(JSON.stringify(msg.payload, null, 2));
    console.log();
  }
}

await closePools();
