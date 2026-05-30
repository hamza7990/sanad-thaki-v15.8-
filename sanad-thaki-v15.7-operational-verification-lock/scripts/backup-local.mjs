import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const outDir = path.resolve("backups");
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outFile = path.join(outDir, `sanad-local-backup-${stamp}.sql`);

execFileSync("docker", ["compose", "exec", "-T", "postgres", "pg_dump", "-U", "sanad_app", "-d", "sanad_thaki"], {
  stdio: ["ignore", fs.openSync(outFile, "w"), "inherit"]
});

console.log("Backup created:", outFile);
