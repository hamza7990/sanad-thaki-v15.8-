import bcrypt from "bcryptjs";
import pg from "pg";

const email = process.env.PLATFORM_ADMIN_EMAIL || "platform-admin@sanad.local";
const password = process.env.PLATFORM_ADMIN_PASSWORD || "ChangeMe123!Secure";

if (password.length < 12) {
  console.error("PLATFORM_ADMIN_PASSWORD must be at least 12 characters.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const hash = await bcrypt.hash(password, 12);
await client.query(
  `INSERT INTO platform_admins (id, email, password_hash, role, is_active)
   VALUES ('platform-admin-main', $1, $2, 'SANAD_ADMIN', true)
   ON CONFLICT (email) DO UPDATE SET password_hash=excluded.password_hash, is_active=true`,
  [email, hash]
);
await client.end();
console.log(`Platform admin ready: ${email}`);
