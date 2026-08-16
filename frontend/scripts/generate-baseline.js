const fs = require('fs');
const path = require('path');

const FRONTEND_DIR = __dirname + '/..';
const localesDir = path.join(FRONTEND_DIR, 'locales');
const srcDir = path.join(FRONTEND_DIR, 'src');

const LOCALES = ['en-US', 'en-GB', 'pt-BR', 'ja-JP', 'ko-KR', 'zh-CN', 'zh-TW'];
const DEFAULT_LOCALE = 'en-US';

function loadLocale(locale) {
  const dir = path.join(localesDir, locale);
  const merged = {};
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
    merged[file.replace('.json', '')] = data;
  }
  return merged;
}

function flatten(obj, prefix, out = []) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix + '.' + k;
    if (typeof v === 'object' && v !== null) flatten(v, key, out);
    else out.push(key);
  }
  return out;
}

const keys = new Set(flatten(loadLocale(DEFAULT_LOCALE), '').map(k => k.replace(/^\./, '')));

function walkDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.next') continue;
      files.push(...walkDir(full));
    } else if (e.name.endsWith('.tsx') || e.name.endsWith('.ts')) {
      files.push(full);
    }
  }
  return files;
}

const gaps = new Set();
for (const file of walkDir(srcDir)) {
  const src = fs.readFileSync(file, 'utf-8');
  let ns = '';
  const nsMatch = /useTranslations\(\s*['"`]([^'"`]+)['"`]\s*\)/.exec(src);
  if (nsMatch) ns = nsMatch[1];
  const tRe = /\bt\(\s*['"`]([^'"`{}]+)['"`]\s*\)/g;
  let m;
  while ((m = tRe.exec(src)) !== null) {
    const key = m[1];
    const fullKey = ns ? ns + '.' + key : key;
    if (!keys.has(fullKey)) gaps.add(fullKey);
  }
}

const baselinePath = path.join(__dirname, 'i18n-known-gaps.txt');
fs.writeFileSync(baselinePath, Array.from(gaps).sort().join('\n') + '\n');
console.log(gaps.size + ' gaps written to baseline');
