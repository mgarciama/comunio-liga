#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, 'src');
const SECTIONS_ORDER = ['inicio', 'bote', 'reglas', 'normas', 'jornadas', 'clasificacion', 'pagos'];

const read = (p) => readFileSync(join(SRC, p), 'utf8').trim();

const sections = SECTIONS_ORDER.map((s) => read(join('sections', `${s}.html`))).join('\n\n');

let html = readFileSync(join(SRC, 'template.html'), 'utf8');
html = html
  .replace('{{CSS}}', read('style.css'))
  .replace('{{NAV}}', read('nav.html'))
  .replace('{{SECTIONS}}', sections)
  .replace('{{FOOTER}}', read('footer.html'))
  .replace('{{LOGIN}}', read('login.html'))
  .replace('{{JS}}', read('app.js'));

const outputs = [join(ROOT, 'index.html'), join(ROOT, 'public', 'index.html')];
for (const out of outputs) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
}

copyFileSync(join(ROOT, 'biwenger-data.json'), join(ROOT, 'public', 'biwenger-data.json'));
copyFileSync(join(ROOT, 'jornadas-data.json'), join(ROOT, 'public', 'jornadas-data.json'));
if (existsSync(join(ROOT, 'jornadas-estado.json'))) {
  copyFileSync(join(ROOT, 'jornadas-estado.json'), join(ROOT, 'public', 'jornadas-estado.json'));
}

console.log('✔ Build OK');
for (const out of outputs) console.log('  →', out);
console.log('  →', join(ROOT, 'public', 'biwenger-data.json'));
console.log('  →', join(ROOT, 'public', 'jornadas-data.json'));
if (existsSync(join(ROOT, 'jornadas-estado.json'))) console.log('  →', join(ROOT, 'public', 'jornadas-estado.json'));