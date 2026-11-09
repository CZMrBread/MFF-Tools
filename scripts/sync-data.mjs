// Zkopíruje data/ do public/data/ (obsah 1:1), aby je Vite servíroval i zabalil do buildu.
// Zdroj pravdy je data/ – public/data/ nikdy needituj ručně.
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(repoRoot, "data");
const target = resolve(repoRoot, "public", "data");

if (!existsSync(source)) {
  console.error(`sync-data: zdrojová složka neexistuje: ${source}`);
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
console.log("sync-data: data/ -> public/data/");
