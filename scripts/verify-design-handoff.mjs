import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
function walk(folder) {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    if (['deliverables', '.git', 'node_modules'].includes(entry.name)) return [];
    const target = path.join(folder, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}
const files = walk(root);
const documents = files.filter(file => file.endsWith('.md'));
for (const file of documents) {
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes('\uFFFD')) errors.push(`Invalid replacement character: ${file}`);
  if (!content.startsWith('# ')) errors.push(`Missing title: ${file}`);
  if ((content.match(/^```/gm) || []).length % 2) errors.push(`Unbalanced code fence: ${file}`);
  for (const match of content.matchAll(/\[[^\]\n]+\]\(([^)]+)\)/g)) {
    const link = match[1].replace(/^<|>$/g, '').split('#')[0];
    if (!link || /^[a-z]+:/i.test(link)) continue;
    if (!fs.existsSync(path.resolve(path.dirname(file), decodeURIComponent(link)))) {
      errors.push(`Broken local link in ${path.relative(root, file)}: ${link}`);
    }
  }
}
const required = [
  'README.md', 'AGENTS.md', 'CLAUDE.md', 'DESIGN_DEVELOPMENT.md',
  'docs/handoff/claude-start-prompt.md', 'docs/handoff/delivery-validation.md',
  'design-reference/family-journal.fragment.html',
];
for (const relative of required) if (!fs.existsSync(path.join(root, relative))) errors.push(`Missing ${relative}`);
const combined = fs.readFileSync(path.join(root, 'DESIGN_DEVELOPMENT.md'), 'utf8');
for (const keyword of ['ID＋密碼', '收到', '沒問題', '三行', '家庭動態', 'PostReaction', 'PostDraft', 'PostgreSQL', 'AI', 'Docker', 'GitHub', 'HTTPS', 'ACC-30', 'Antigravity']) {
  if (!combined.includes(keyword)) errors.push(`Missing requirement keyword: ${keyword}`);
}
if ((combined.match(/^## 第 \d+ 章/gm) || []).length !== 8) errors.push('Expected eight design chapters.');
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`PASS: ${documents.length} Markdown files, local links, UTF-8, fences, required files and eight design chapters. Keyword checks are completeness guards, not functional tests.`);
