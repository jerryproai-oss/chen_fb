'use client';

import { useRef, useCallback, useState } from 'react';
import {
  Editor, rootCtx, defaultValueCtx,
  editorViewOptionsCtx, editorViewCtx, commandsCtx,
} from '@milkdown/kit/core';
import {
  commonmark,
  toggleStrongCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  wrapInHeadingCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  wrapInBlockquoteCommand,
  insertHrCommand,
  createCodeBlockCommand,
  turnIntoTextCommand,
} from '@milkdown/kit/preset/commonmark';
import {
  gfm,
  toggleStrikethroughCommand,
  insertTableCommand,
} from '@milkdown/kit/preset/gfm';
import { history } from '@milkdown/kit/plugin/history';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';
import { nord } from '@milkdown/theme-nord';
import '@milkdown/theme-nord/style.css';

import styles from './MilkdownEditor.module.css';

// ── 型別定義 ──────────────────────────────────────────────────

export interface MilkdownEditorProps {
  /** 初始 markdown 內容 */
  value: string;
  /** 內容變更時回呼 */
  onChange?: (markdown: string) => void;
  /** 唯讀模式 */
  readOnly?: boolean;
}

// ── 工具列定義 ────────────────────────────────────────────────

interface ToolbarItem {
  id: string;
  label: string;
  icon: string;
  shortcut?: string;
  group: string;
}

const TOOLBAR_ITEMS: ToolbarItem[] = [
  // 標題
  { id: 'h1', label: '主標題', icon: 'H1', group: 'heading' },
  { id: 'h2', label: '次標題', icon: 'H2', group: 'heading' },
  { id: 'h3', label: '三級標題', icon: 'H3', group: 'heading' },
  { id: 'paragraph', label: '正文', icon: '¶', group: 'heading' },
  // 文字格式
  { id: 'bold', label: '粗體', icon: 'B', shortcut: 'Ctrl+B', group: 'inline' },
  { id: 'italic', label: '斜體', icon: 'I', shortcut: 'Ctrl+I', group: 'inline' },
  { id: 'strikethrough', label: '刪除線', icon: 'S', group: 'inline' },
  { id: 'inlineCode', label: '行內程式碼', icon: '<>', group: 'inline' },
  // 區塊
  { id: 'bulletList', label: '項目清單', icon: '•', group: 'block' },
  { id: 'orderedList', label: '編號清單', icon: '1.', group: 'block' },
  { id: 'blockquote', label: '引用', icon: '❝', group: 'block' },
  { id: 'codeBlock', label: '程式碼區塊', icon: '{ }', group: 'block' },
  { id: 'hr', label: '分隔線', icon: '—', group: 'block' },
  // 插入
  { id: 'image', label: '插入圖片', icon: '🖼', group: 'insert' },
  { id: 'table', label: '插入表格', icon: '▦', group: 'insert' },
];

// ── 工具列元件 ────────────────────────────────────────────────

interface ToolbarProps {
  onCommand: (id: string) => void;
  onImageUpload: () => void;
  uploading: boolean;
}

function Toolbar({ onCommand, onImageUpload, uploading }: ToolbarProps) {
  const [showGuide, setShowGuide] = useState(false);

  const groups = ['heading', 'inline', 'block', 'insert'] as const;
  const groupedItems: Record<string, ToolbarItem[]> = {};
  for (const item of TOOLBAR_ITEMS) {
    if (!groupedItems[item.group]) groupedItems[item.group] = [];
    groupedItems[item.group].push(item);
  }

  return (
    <div className={styles.toolbar}>
      <div className={styles.toolbarInner}>
        {groups.map((group, gi) => (
          <div key={group} className={styles.toolbarGroup}>
            {gi > 0 && <span className={styles.toolbarSep} />}
            {groupedItems[group]?.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`${styles.toolbarBtn} ${item.id === 'bold' ? styles.toolbarBtnBold : ''} ${item.id === 'italic' ? styles.toolbarBtnItalic : ''} ${item.id === 'strikethrough' ? styles.toolbarBtnStrike : ''}`}
                title={`${item.label}${item.shortcut ? ` (${item.shortcut})` : ''}`}
                onClick={() => {
                  if (item.id === 'image') {
                    onImageUpload();
                  } else {
                    onCommand(item.id);
                  }
                }}
                disabled={uploading && item.id === 'image'}
              >
                {item.id === 'image' && uploading ? '⏳' : item.icon}
              </button>
            ))}
          </div>
        ))}

        <div className={styles.toolbarRight}>
          <button
            type="button"
            className={styles.guideBtn}
            title="Markdown 快捷鍵指引"
            onClick={() => setShowGuide(!showGuide)}
          >
            ?
          </button>
        </div>
      </div>

      {showGuide && (
        <div className={styles.guidePanel}>
          <div className={styles.guidePanelHeader}>
            <span>⌨️ 快捷鍵與 Markdown 語法</span>
            <button type="button" onClick={() => setShowGuide(false)} className={styles.guideClose}>✕</button>
          </div>
          <div className={styles.guideGrid}>
            <div className={styles.guideSection}>
              <h4>快捷鍵</h4>
              <div className={styles.guideItem}><kbd>Ctrl+B</kbd> 粗體</div>
              <div className={styles.guideItem}><kbd>Ctrl+I</kbd> 斜體</div>
              <div className={styles.guideItem}><kbd>Ctrl+Z</kbd> 復原</div>
              <div className={styles.guideItem}><kbd>Ctrl+Y</kbd> 重做</div>
              <div className={styles.guideItem}><kbd>Enter</kbd> 新段落</div>
              <div className={styles.guideItem}><kbd>Shift+Enter</kbd> 換行</div>
              <div className={styles.guideItem}><kbd>Tab</kbd> 縮排清單</div>
            </div>
            <div className={styles.guideSection}>
              <h4>Markdown 語法</h4>
              <div className={styles.guideItem}><code># 標題</code> 主標題</div>
              <div className={styles.guideItem}><code>## 標題</code> 次標題</div>
              <div className={styles.guideItem}><code>**粗體**</code> 粗體文字</div>
              <div className={styles.guideItem}><code>*斜體*</code> 斜體文字</div>
              <div className={styles.guideItem}><code>~~刪除~~</code> 刪除線</div>
              <div className={styles.guideItem}><code>`程式碼`</code> 行內程式碼</div>
              <div className={styles.guideItem}><code>- 項目</code> 項目清單</div>
              <div className={styles.guideItem}><code>1. 項目</code> 編號清單</div>
              <div className={styles.guideItem}><code>&gt; 引用</code> 引用區塊</div>
              <div className={styles.guideItem}><code>---</code> 分隔線</div>
              <div className={styles.guideItem}><code>```code```</code> 程式碼區塊</div>
              <div className={styles.guideItem}><code>![alt](url)</code> 圖片</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 編輯器內部元件 ────────────────────────────────────────────

function MilkdownEditorInner({ value, onChange, readOnly }: MilkdownEditorProps) {
  const editorGetRef = useRef<(() => Editor | undefined) | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { get } = useEditor((root) => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, value);

        // 唯讀模式
        if (readOnly) {
          ctx.update(editorViewOptionsCtx, (prev) => ({
            ...prev,
            editable: () => false,
          }));
        }

        // 監聽內容變更
        if (onChange && !readOnly) {
          ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
            onChange(markdown);
          });
        }
      })
      .config(nord)
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(listener)
      .use(clipboard);

    return editor;
  }, []);

  // 儲存 get 函式供工具列使用
  editorGetRef.current = get;

  // ── 執行編輯器命令 ──────────────────────────────────

  const handleCommand = useCallback((id: string) => {
    const editor = editorGetRef.current?.();
    if (!editor) return;

    editor.action((ctx) => {
      const commands = ctx.get(commandsCtx);

      switch (id) {
        case 'h1':
          commands.call(wrapInHeadingCommand.key, 1);
          break;
        case 'h2':
          commands.call(wrapInHeadingCommand.key, 2);
          break;
        case 'h3':
          commands.call(wrapInHeadingCommand.key, 3);
          break;
        case 'paragraph':
          commands.call(turnIntoTextCommand.key);
          break;
        case 'bold':
          commands.call(toggleStrongCommand.key);
          break;
        case 'italic':
          commands.call(toggleEmphasisCommand.key);
          break;
        case 'strikethrough':
          commands.call(toggleStrikethroughCommand.key);
          break;
        case 'inlineCode':
          commands.call(toggleInlineCodeCommand.key);
          break;
        case 'bulletList':
          commands.call(wrapInBulletListCommand.key);
          break;
        case 'orderedList':
          commands.call(wrapInOrderedListCommand.key);
          break;
        case 'blockquote':
          commands.call(wrapInBlockquoteCommand.key);
          break;
        case 'codeBlock':
          commands.call(createCodeBlockCommand.key);
          break;
        case 'hr':
          commands.call(insertHrCommand.key);
          break;
        case 'table':
          commands.call(insertTableCommand.key);
          break;
      }
    });
  }, []);

  // ── 圖片上傳 ────────────────────────────────────────

  const handleImageUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 重置 input 以便可以重複選同一檔案
    e.target.value = '';

    // 驗證檔案類型
    if (!file.type.startsWith('image/')) {
      alert('請選擇圖片檔案');
      return;
    }

    // 驗證檔案大小 (20MB)
    if (file.size > 20 * 1024 * 1024) {
      alert('圖片大小不可超過 20MB');
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '上傳失敗');
      }

      const data = await res.json();
      const imageUrl = data.media?.url;

      if (!imageUrl) throw new Error('未取得圖片網址');

      // 插入圖片到編輯器
      const editor = editorGetRef.current?.();
      if (editor) {
        editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          const { state, dispatch } = view;
          const imageType = state.schema.nodes.image;
          if (imageType) {
            const node = imageType.create({
              src: imageUrl,
              alt: file.name,
              title: file.name,
            });
            dispatch(state.tr.replaceSelectionWith(node));
          }
        });
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '圖片上傳失敗');
    } finally {
      setUploading(false);
    }
  }, []);

  return (
    <>
      {!readOnly && (
        <Toolbar
          onCommand={handleCommand}
          onImageUpload={handleImageUpload}
          uploading={uploading}
        />
      )}
      <div className={readOnly ? styles.editorReadOnly : styles.editorArea}>
        <Milkdown />
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: 'none' }}
        aria-hidden="true"
      />
    </>
  );
}

// ── 主元件（含 Provider）─────────────────────────────────────

export default function MilkdownEditor(props: MilkdownEditorProps) {
  const containerClass = [
    styles.editorContainer,
    props.readOnly ? styles.readOnly : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={containerClass}>
      <MilkdownProvider>
        <MilkdownEditorInner {...props} />
      </MilkdownProvider>
    </div>
  );
}
