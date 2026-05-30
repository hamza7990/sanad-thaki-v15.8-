import { execFileSync } from "node:child_process";
import fs from "node:fs";

const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
  console.error("Usage: node scripts/restore-local.mjs backups/file.sql");
  process.exit(1);
}

const sql = fs.readFileSync(file);
const child = execFileSync("docker", ["compose", "exec", "-T", "postgres", "psql", "-U", "sanad_app", "-d", "sanad_thaki"], {
  input: sql,
  stdio: ["pipe", "inherit", "inherit"]
});

console.log("Restore completed.");
