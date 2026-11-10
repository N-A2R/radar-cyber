import { Pool } from "pg";
import { hashPassword } from "../apps/api/src/auth.js";

const email = process.argv[2] ?? process.env.RADAR_ADMIN_EMAIL ?? "admin@radar.local";
const password = process.env.RADAR_ADMIN_PASSWORD;
if (!password) {
  console.error("Set RADAR_ADMIN_PASSWORD");
  process.exit(1);
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://radar:radar@localhost:5432/radar" });
const hash = await hashPassword(password);
await pool.query(
  "INSERT INTO app_user (email, password_hash, role, display_name) VALUES ($1,$2,'admin',$3) ON CONFLICT (email) DO NOTHING",
  [email.toLowerCase(), hash, "Admin"]
);
console.log("admin ensured:", email);
await pool.end();
