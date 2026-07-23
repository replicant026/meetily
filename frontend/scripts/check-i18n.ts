// Validates that all locale JSONs are in sync. Reports:
//  (a) any key present in one locale but missing in another
//  (b) any empty string values (a translation in progress would be invisible)
//  (c) static t() calls in source that reference keys missing from default locale
//
//  - Add a key in any locale => all locales must be updated, or this script fails.

import { readFileSync, readdirSync } from "fs";
import { join, resolve, sep } from "path";
import { LOCALES, DEFAULT_LOCALE } from "../src/i18n/config";

const FRONTEND_DIR = resolve(__dirname, "..");
const LOCALES_DIR = join(FRONTEND_DIR, "locales");

type KeyTree = { [k: string]: string | KeyTree };

function loadLocale(locale: string): KeyTree {
  const dir = join(LOCALES_DIR, locale);
  const merged: KeyTree = {};
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const data = JSON.parse(readFileSync(join(dir, file), "utf-8")) as KeyTree;
    merged[file.replace(".json", "")] = data;
  }
  return merged;
}

function flatten(obj: KeyTree, prefix: string, out: string[] = []): string[] {
  for (const [k, v] of Object.entries(obj)) {
    const key = `${prefix}.${k}`;
    if (typeof v === "object" && v !== null) {
      flatten(v, key, out);
    } else {
      out.push(key);
    }
  }
  return out;
}

let errors = 0;
const allKeys = new Map<string, Set<string>>();
for (const locale of LOCALES) {
  allKeys.set(locale, new Set(flatten(loadLocale(locale), "").map((k) => k.replace(/^\./, ""))));
}

const union = new Set<string>();
for (const keys of allKeys.values()) {
  for (const k of keys) union.add(k);
}
for (const k of union) {
  for (const locale of LOCALES) {
    if (!allKeys.get(locale)!.has(k)) {
      console.error(`ERROR: locale "${locale}" missing key "${k}"`);
      errors++;
    }
  }
}

for (const locale of LOCALES) {
  const tree = loadLocale(locale);
  function walk(obj: KeyTree, prefix: string) {
    for (const [k, v] of Object.entries(obj)) {
      const key = `${prefix}.${k}`;
      if (typeof v === "object" && v !== null) walk(v, key);
      else if (typeof v === "string" && v.trim() === "") {
        console.error(`ERROR: locale "${locale}" has empty value for "${key}"`);
        errors++;
      }
    }
  }
  walk(tree, "");
}

// --- Phase 2: basic code → catalog cross-check (warnings only) ---
// Collect t('key') calls from source files and verify keys exist in default locale.
// Currently warn-only — upgrade to errors once existing gaps are fixed.

const SRC_DIR = join(FRONTEND_DIR, "src");
const defaultKeys = allKeys.get(DEFAULT_LOCALE)!;

function walkDir(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".next") continue;
      files.push(...walkDir(full));
    } else if (e.name.endsWith(".tsx") || e.name.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

let codeWarnings = 0;

for (const file of walkDir(SRC_DIR)) {
  const src = readFileSync(file, "utf-8");

  // Find namespace prefix (first useTranslations call)
  let ns = "";
  const nsMatch = /useTranslations\(\s*['"`]([^'"]+)['"`]\s*\)/.exec(src);
  if (nsMatch) ns = nsMatch[1];

  // Collect static t('...') calls
  const tRe = /\bt\(\s*['"`]([^'"`{}]+)['"`]\s*\)/g;
  let m;
  while ((m = tRe.exec(src)) !== null) {
    const key = m[1];
    // Resolve full key: if key contains a dot, treat as absolute; else prefix with namespace
    const fullKey = key.includes(".") ? key : ns ? `${ns}.${key}` : key;
    if (!defaultKeys.has(fullKey)) {
      const rel = file.replace(FRONTEND_DIR + sep, "");
      console.warn(
        `WARN: key "${fullKey}" used in ${rel} not found in default locale (${DEFAULT_LOCALE})`
      );
      codeWarnings++;
    }
  }
}

if (codeWarnings > 0) {
  console.warn(`\n${codeWarnings} code→catalog warning(s) (non-blocking)`);
}

if (errors > 0) {
  console.error(`\n${errors} i18n issue(s) found`);
  process.exit(1);
}
console.log("i18n check passed");
