import { createRequire } from "module";
const require = createRequire(import.meta.url);
export const { runMigrationsOnUrl } = require("../src/migrate-core.js");
