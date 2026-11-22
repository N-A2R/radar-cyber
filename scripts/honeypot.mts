/**
 * Standalone NA decoy listener: `pnpm honeypot:start`.
 * Opt-in from the main API with `RADAR_HONEYPOT=1` instead if preferred.
 */
import { startHoneypot } from "../apps/api/src/honeypot/server.js";

const server = await startHoneypot();
const address = server.address();
const port = address !== null && typeof address !== "string" ? address.port : 0;
console.log(`honeypot: Nouvelle-Aquitaine decoy listening on port ${port}`);
console.log("honeypot: GET /honeypot/scans on the API returns the 24 h summary");

const shutdown = () => {
	server.close(() => process.exit(0));
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
