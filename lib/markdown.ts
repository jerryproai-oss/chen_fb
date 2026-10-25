/** 將 tag 名稱轉為 slug（英文轉小寫，中文保留） */
function slugifyTag(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * 簡易 Markdown 渲染器
 * 將 TextToolbar 產生的 markdown 語法轉換為安全的 HTML
 * 
 * 支援：**粗體**、*斜體*、~~刪除線~~、## 標題、
 *       - 清單、1. 編號清單、> 引用、---、emoji、
 *       | 表格 |、子清單（縮排）
 */

/** 轉義 HTML 特殊字元 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 處理行內格式（粗體、斜體、刪除線） */
function renderInline(text: string): string {
  let result = escapeHtml(text);
  // 粗體 **text**
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // 斜體 *text*（排除已經是粗體的）
  result = result.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
  // 刪除線 ~~text~~
  result = result.replace(/~~(.+?)~~/g, '<del>$1</del>');
  // 行內程式碼 `text`
  result = result.replace(/`([^`]+?)`/g, '<code class="inline-code">$1</code>');
  // URL 自動連結（簡易版）
  result = result.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>',
  );
  // Hashtag #tag -> <a href="/tags/slug" class="hashtag">#tag</a>
  result = result.replace(
    /(^|[^\w&/])#([\u4e00-\u9fff\w]+)/g,
    (_match, prefix, tag) => {
      const slug = slugifyTag(tag);
      return `${prefix}<a href="/tags/${slug}" class="hashtag">#${tag}</a>`;
    },
  );
  return result;
}

/**
 * 檢查一行是否為表格分隔行（如 |------|------|）
 */
function isTableSeparator(line: string): boolean {
  return /^\|?[\s-:|]+\|[\s-:|]*\|?$/.test(line.trim());
}

/**
 * 解析表格行，回傳各欄位內容（去除首尾 pipe 和空白）
 */
function parseTableRow(line: string): string[] {
  let trimmed = line.trim();
  // 移除首尾的 |
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split('|').map((cell) => cell.trim());
}

/**
 * 解析表格對齊方式
 */
function parseTableAlignments(separatorLine: string): string[] {
  const cells = parseTableRow(separatorLine);
  return cells.map((cell) => {
    const trimmed = cell.trim().replace(/\s/g, '');
    if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center';
    if (trimmed.endsWith(':')) return 'right';
    return 'left';
  });
}

/**
 * 將 markdown 文字轉為安全的 HTML 字串
 */
export function renderMarkdown(text: string): string {
  // 合併連續空行為單個空行
  const normalized = text.replace(/\n{3,}/g, '\n\n');
  const lines = normalized.split('\n');
  const htmlParts: string[] = [];
  let inList = false;
  let inOrderedList = false;
  let inBlockquote = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 圖片 ![alt](url)
    const imgMatch = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) {
      closeBlocks();
      const alt = escapeHtml(imgMatch[1]);
      const src = escapeHtml(imgMatch[2]);
      htmlParts.push(`<figure class="md-image"><img src="${src}" alt="${alt}" loading="lazy" />${alt ? `<figcaption>${alt}</figcaption>` : ''}</figure>`);
      continue;
    }

    // 程式碼區塊 ```
    if (line.trim().startsWith('```')) {
      closeBlocks();
      // 收集程式碼區塊的行
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      // i 現在指向結尾的 ``` 或已超出範圍
      const codeContent = escapeHtml(codeLines.join('\n'));
      const langAttr = lang ? ` data-lang="${escapeHtml(lang)}"` : '';
      const langLabel = lang ? `<div class="code-lang">${escapeHtml(lang)}</div>` : '';
      htmlParts.push(`<div class="code-block"${langAttr}>${langLabel}<pre><code>${codeContent}</code></pre></div>`);
      continue;
    }

    // ── 表格偵測 ──────────────────────────────────────────
    // 表格：當前行含 |，且下一行是分隔行（|---|---|）
    if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      closeBlocks();
      const headerCells = parseTableRow(line);
      const alignments = parseTableAlignments(lines[i + 1]);
      i += 2; // 跳過 header 和分隔行

      // 開始表格
      htmlParts.push('<div class="table-wrapper"><table>');

      // 表頭
      htmlParts.push('<thead><tr>');
      headerCells.forEach((cell, idx) => {
        const align = alignments[idx] || 'left';
        htmlParts.push(`<th style="text-align:${align}">${renderInline(cell)}</th>`);
      });
      htmlParts.push('</tr></thead>');

      // 表身
      htmlParts.push('<tbody>');
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        const bodyCells = parseTableRow(lines[i]);
        htmlParts.push('<tr>');
        // 填充到與 header 同樣的欄數
        for (let col = 0; col < headerCells.length; col++) {
          const align = alignments[col] || 'left';
          const cellContent = bodyCells[col] !== undefined ? bodyCells[col] : '';
          htmlParts.push(`<td style="text-align:${align}">${renderInline(cellContent)}</td>`);
        }
        htmlParts.push('</tr>');
        i++;
      }
      htmlParts.push('</tbody></table></div>');

      i--; // 回退一行，讓 for 迴圈的 i++ 處理
      continue;
    }

    // 分隔線 ---
    if (/^-{3,}$/.test(line.trim())) {
      closeBlocks();
      htmlParts.push('<hr />');
      continue;
    }

    // 標題 ## text
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      closeBlocks();
      const level = Math.min(headingMatch[1].length + 1, 6); // ## -> h3, 最大 h6
      htmlParts.push(`<h${level}>${renderInline(headingMatch[2])}</h${level}>`);
      continue;
    }

    // 引用 > text
    if (line.startsWith('> ') || line === '>') {
      if (!inBlockquote) {
        closeBlocks();
        htmlParts.push('<blockquote>');
        inBlockquote = true;
      }
      const content = line.startsWith('> ') ? line.slice(2) : '';
      htmlParts.push(renderInline(content));
      htmlParts.push('<br />');
      continue;
    } else if (inBlockquote) {
      htmlParts.push('</blockquote>');
      inBlockquote = false;
    }

    // 子清單（縮排兩空格以上的 - 或數字）
    if (/^\s{2,}[-*]\s+/.test(line)) {
      // 當作清單項目處理（屬於上一個清單的子項）
      const content = line.replace(/^\s+[-*]\s+/, '');
      if (!inList) {
        closeBlocks();
        htmlParts.push('<ul>');
        inList = true;
      }
      htmlParts.push(`<li style="margin-left:1.5em">${renderInline(content)}</li>`);
      continue;
    }

    // 無序清單 - text
    if (/^[-*]\s+/.test(line)) {
      if (!inList) {
        closeBlocks();
        htmlParts.push('<ul>');
        inList = true;
      }
      const content = line.replace(/^[-*]\s+/, '');
      htmlParts.push(`<li>${renderInline(content)}</li>`);
      continue;
    } else if (inList) {
      htmlParts.push('</ul>');
      inList = false;
    }

    // 有序清單 1. text
    if (/^\d+\.\s+/.test(line)) {
      if (!inOrderedList) {
        closeBlocks();
        htmlParts.push('<ol>');
        inOrderedList = true;
      }
      const content = line.replace(/^\d+\.\s+/, '');
      htmlParts.push(`<li>${renderInline(content)}</li>`);
      continue;
    } else if (inOrderedList) {
      htmlParts.push('</ol>');
      inOrderedList = false;
    }

    // 空行
    if (line.trim() === '') {
      closeBlocks();
      continue;
    }

    // 普通段落
    htmlParts.push(`<p>${renderInline(line)}</p>`);
  }

  closeBlocks();

  function closeBlocks() {
    if (inList) {
      htmlParts.push('</ul>');
      inList = false;
    }
    if (inOrderedList) {
      htmlParts.push('</ol>');
      inOrderedList = false;
    }
    if (inBlockquote) {
      htmlParts.push('</blockquote>');
      inBlockquote = false;
    }
  }

  return htmlParts.join('\n');
}

/**
 * 去除 markdown 語法，回傳乾淨的純文字（用於卡片預覽）
 */
export function stripMarkdown(text: string): string {
  return text
    // 粗體 **text** / __text__
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    // 斜體 *text* / _text_
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1')
    // 刪除線 ~~text~~
    .replace(/~~(.+?)~~/g, '$1')
    // 標題 ## text
    .replace(/^#{1,6}\s+/gm, '')
    // 程式碼區塊 ```...```
    .replace(/```[\s\S]*?```/g, '')
    // 行內程式碼 `text`
    .replace(/`([^`]+?)`/g, '$1')
    // 分隔線
    .replace(/^-{3,}$/gm, '')
    // 引用 > text
    .replace(/^>\s?/gm, '')
    // 無序清單
    .replace(/^[-*]\s+/gm, '')
    // 有序清單
    .replace(/^\d+\.\s+/gm, '')
    // 清除連續空行
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
