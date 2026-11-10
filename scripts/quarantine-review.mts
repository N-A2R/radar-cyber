import { Client } from "pg";
const url = process.env.DATABASE_URL ?? "postgres://radar:radar@localhost:5432/radar";
const client = new Client({ connectionString: url });
await client.connect();

const [cmd, arg] = process.argv.slice(2);

if (cmd === "pending") {
  const r = await client.query("SELECT id,source,groupe,org_hint,claimed_at,status,received_at FROM quarantine_raw WHERE status='pending' AND promoted=false ORDER BY received_at DESC LIMIT 50");
  console.table(r.rows);
} else if (cmd === "promote" && arg) {
  await client.query("UPDATE quarantine_raw SET promoted=true, promoted_at=now(), promoted_by=$2, status='promoted' WHERE id=$1", [arg, process.env.USER ?? "cli"]);
  console.log("promoted", arg);
} else if (cmd === "reject" && arg) {
  await client.query("UPDATE quarantine_raw SET status='rejected' WHERE id=$1", [arg]);
  console.log("rejected", arg);
} else if (cmd === "purge") {
  const r = await client.query("DELETE FROM quarantine_raw WHERE purge_after < now() AND promoted=false");
  console.log("purged", r.rowCount);
} else {
  console.log("usage: pending | promote <id> | reject <id> | purge");
}
await client.end();
