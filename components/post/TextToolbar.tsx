'use client';

import { Bold, Italic, Strikethrough, List, ListOrdered, Quote, Minus, Heading2, Code } from 'lucide-react';
import EmojiPicker from '@/components/post/EmojiPicker';
import styles from './TextToolbar.module.css';

/** 工具列按鈕定義 */
interface ToolAction {
  icon: React.ReactNode;
  label: string;
  /** 執行的格式化動作 */
  action: (ta: HTMLTextAreaElement, body: string) => { newBody: string; cursorPos: number };
}

/**
 * 在選取文字前後包裹指定符號。
 * 若沒有選取文字，插入符號並將游標放在中間。
 */
function wrapSelection(
  ta: HTMLTextAreaElement,
  body: string,
  prefix: string,
  suffix: string,
): { newBody: string; cursorPos: number } {
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const selected = body.slice(start, end);

  if (selected.length > 0) {
    const newBody = body.slice(0, start) + prefix + selected + suffix + body.slice(end);
    return { newBody, cursorPos: end + prefix.length + suffix.length };
  }

  const newBody = body.slice(0, start) + prefix + suffix + body.slice(end);
  return { newBody, cursorPos: start + prefix.length };
}

/**
 * 在選取文字每行開頭插入前綴。
 * 若沒有選取文字，在當前行開頭插入前綴。
 */
function prependLines(
  ta: HTMLTextAreaElement,
  body: string,
  prefix: string | ((lineIndex: number) => string),
): { newBody: string; cursorPos: number } {
  const start = ta.selectionStart;
  const end = ta.selectionEnd;

  // 找到包含選取範圍的完整行
  const lineStart = body.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = body.indexOf('\n', end);
  const actualEnd = lineEnd === -1 ? body.length : lineEnd;

  const selectedLines = body.slice(lineStart, actualEnd).split('\n');
  const newLines = selectedLines.map((line, i) => {
    const p = typeof prefix === 'function' ? prefix(i) : prefix;
    return p + line;
  });

  const replacement = newLines.join('\n');
  const newBody = body.slice(0, lineStart) + replacement + body.slice(actualEnd);
  return { newBody, cursorPos: lineStart + replacement.length };
}

const TOOLS: ToolAction[] = [
  {
    icon: <Heading2 size={16} />,
    label: '標題',
    action: (ta, body) => prependLines(ta, body, '## '),
  },
  {
    icon: <Bold size={16} />,
    label: '粗體',
    action: (ta, body) => wrapSelection(ta, body, '**', '**'),
  },
  {
    icon: <Italic size={16} />,
    label: '斜體',
    action: (ta, body) => wrapSelection(ta, body, '*', '*'),
  },
  {
    icon: <Strikethrough size={16} />,
    label: '刪除線',
    action: (ta, body) => wrapSelection(ta, body, '~~', '~~'),
  },
  {
    icon: <List size={16} />,
    label: '項目清單',
    action: (ta, body) => prependLines(ta, body, '- '),
  },
  {
    icon: <ListOrdered size={16} />,
    label: '編號清單',
    action: (ta, body) => prependLines(ta, body, (i) => `${i + 1}. `),
  },
  {
    icon: <Quote size={16} />,
    label: '引言',
    action: (ta, body) => prependLines(ta, body, '> '),
  },
  {
    icon: <Minus size={16} />,
    label: '分隔線',
    action: (ta, body) => {
      const start = ta.selectionStart;
      const before = start > 0 && body[start - 1] !== '\n' ? '\n' : '';
      const insert = before + '---\n';
      const newBody = body.slice(0, start) + insert + body.slice(start);
      return { newBody, cursorPos: start + insert.length };
    },
  },
  {
    icon: <Code size={16} />,
    label: '程式碼區塊',
    action: (ta, body) => {
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const selected = body.slice(start, end);
      const before = start > 0 && body[start - 1] !== '\n' ? '\n' : '';

      if (selected.length > 0) {
        // 包裹選取文字
        const insert = before + '```\n' + selected + '\n```\n';
        const newBody = body.slice(0, start) + insert + body.slice(end);
        return { newBody, cursorPos: start + before.length + 4 + selected.length + 5 };
      }
      // 無選取：插入空的程式碼區塊，游標放在中間
      const insert = before + '```\n\n```\n';
      const newBody = body.slice(0, start) + insert + body.slice(end);
      return { newBody, cursorPos: start + before.length + 4 };
    },
  },
];

interface TextToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  body: string;
  onBodyChange: (newBody: string) => void;
}

/**
 * 文字編輯工具列
 * 提供基本格式化工具（Markdown 語法）和 Emoji 選擇器
 */
export default function TextToolbar({ textareaRef, body, onBodyChange }: TextToolbarProps) {
  function handleTool(tool: ToolAction) {
    const ta = textareaRef.current;
    if (!ta) return;

    const { newBody, cursorPos } = tool.action(ta, body);
    onBodyChange(newBody);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(cursorPos, cursorPos);
    });
  }

  function handleEmoji(emoji: string) {
    const ta = textareaRef.current;
    if (ta) {
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const newBody = body.slice(0, start) + emoji + body.slice(end);
      onBodyChange(newBody);
      requestAnimationFrame(() => {
        ta.focus();
        const pos = start + emoji.length;
        ta.setSelectionRange(pos, pos);
      });
    } else {
      onBodyChange(body + emoji);
    }
  }

  return (
    <div className={styles.toolbar}>
      <div className={styles.tools}>
        {TOOLS.map((tool) => (
          <button
            key={tool.label}
            type="button"
            className={styles.toolBtn}
            onClick={() => handleTool(tool)}
            title={tool.label}
            aria-label={tool.label}
          >
            {tool.icon}
          </button>
        ))}
        <span className={styles.divider} />
        <EmojiPicker onSelect={handleEmoji} />
      </div>
    </div>
  );
}
