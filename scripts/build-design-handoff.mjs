import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chapters = [
  ['開發規範', 'AGENTS.md'],
  ['產品與驗收規格', 'docs/specs/family-journal-product-spec.md'],
  ['畫面與互動設計', 'docs/design/interface-design.md'],
  ['系統與資料設計', 'docs/architecture/system-design.md'],
  ['NAS 部署與維運', 'docs/deployment/nas-docker.md'],
  ['里程碑與驗收', 'docs/testing/acceptance-plan.md'],
  ['目前實作交接', 'docs/handoff/implementation-handoff.md'],
  ['Claude 開工指令', 'docs/handoff/claude-start-prompt.md'],
];
let result = '# 拾日家庭手札完整設計開發書\n\n';
result += '交接基準日期：2026-10-18。供使用者在 Antigravity 中交由 Claude 閱讀與實作。\n\n';
result += '本檔為產品需求、畫面規範、技術契約、部署、驗收與開工指令的單檔快照；目前是規劃與介面參考，尚無正式 app、資料庫或 NAS 部署。正式品牌暫用拾日。\n\n';
result += '需求優先順序：使用者最新指示 → AGENTS.md 與現行專題文件 → 本彙整快照 → 示意原始碼。實作後維護專題文件與交接，再執行 node scripts/build-design-handoff.mjs 重建本檔，不要雙份獨立修改。\n\n';
result += '圖片與介面原始片段隨完整資料夾附於 design-reference；單獨傳送本檔仍可閱讀全部文字設計，但不包含這些圖像資產。\n\n';
result += '## 章節索引\n\n' + chapters.map(([title], i) => `${i + 1}. ${title}`).join('\n') + '\n\n';
chapters.forEach(([title, relative], i) => {
  let content = fs.readFileSync(path.join(root, relative), 'utf8').replace(/^# .+\r?\n/, '').trim();
  let inFence = false;
  content = content.split(/\r?\n/).map(line => {
    if (line.startsWith('```')) { inFence = !inFence; return line; }
    return !inFence && /^#{1,5} /.test(line) ? `#${line}` : line;
  }).join('\n');
  result += `## 第 ${i + 1} 章 ${title}\n\n來源文件：${relative}。\n\n${content}\n\n`;
});
fs.writeFileSync(path.join(root, 'DESIGN_DEVELOPMENT.md'), result, 'utf8');
console.log(`Built DESIGN_DEVELOPMENT.md (${Buffer.byteLength(result)} bytes, ${chapters.length} chapters).`);
