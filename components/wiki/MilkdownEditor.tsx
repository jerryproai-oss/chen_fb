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
  toggleLinkCommand,
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
  addRowAfterCommand,
  addRowBeforeCommand,
  addColAfterCommand,
  addColBeforeCommand,
  deleteSelectedCellsCommand,
} from '@milkdown/kit/preset/gfm';
import { history, undoCommand, redoCommand } from '@milkdown/kit/plugin/history';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { indent, indentConfig } from '@milkdown/kit/plugin/indent';
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';
import { nord } from '@milkdown/theme-nord';
import '@milkdown/theme-nord/style.css';

import styles from './MilkdownEditor.module.css';

// ── 型別定義 ──────────────────────────────────────────────────

export interface MilkdownEditorProps {
  value: string;
  onChange?: (markdown: string) => void;
  readOnly?: boolean;
}

// ── 工具列按鈕定義 ────────────────────────────────────────────

interface ToolbarItemDef {
  id: string;
  label: string;
  icon: string;
  shortcut?: string;
  group: string;
}

const TOOLBAR_ITEMS: ToolbarItemDef[] = [
  // 復原 / 重做
  { id: 'undo', label: '復原', icon: '↩', shortcut: 'Ctrl+Z', group: 'history' },
  { id: 'redo', label: '重做', icon: '↪', shortcut: 'Ctrl+Y', group: 'history' },
  // 標題
  { id: 'h1', label: '主標題', icon: 'H1', group: 'heading' },
  { id: 'h2', label: '次標題', icon: 'H2', group: 'heading' },
  { id: 'h3', label: '三級標題', icon: 'H3', group: 'heading' },
  { id: 'paragraph', label: '正文', icon: '¶', group: 'heading' },
  // 文字格式
  { id: 'bold', label: '粗體', icon: 'B', shortcut: 'Ctrl+B', group: 'inline' },
  { id: 'italic', label: '斜體', icon: 'I', shortcut: 'Ctrl+I', group: 'inline' },
  { id: 'strikethrough', label: '刪除線', icon: 'S̶', group: 'inline' },
  { id: 'inlineCode', label: '行內程式碼', icon: '`c`', group: 'inline' },
  { id: 'link', label: '插入連結', icon: '🔗', shortcut: 'Ctrl+K', group: 'inline' },
  // 區塊
  { id: 'bulletList', label: '項目清單', icon: '• ≡', group: 'block' },
  { id: 'orderedList', label: '編號清單', icon: '1. ≡', group: 'block' },
  { id: 'blockquote', label: '引用', icon: '❝', group: 'block' },
  { id: 'codeBlock', label: '程式碼區塊', icon: '⌨', group: 'block' },
  { id: 'hr', label: '分隔線', icon: '──', group: 'block' },
  // 插入
  { id: 'image', label: '插入圖片', icon: '📷', group: 'insert' },
  { id: 'table', label: '插入表格', icon: '▦', group: 'insert' },
];

// 表格編輯用（當在表格中時顯示）
const TABLE_ITEMS: ToolbarItemDef[] = [
  { id: 'addRowBefore', label: '上方插入列', icon: '⬆行', group: 'table' },
  { id: 'addRowAfter', label: '下方插入列', icon: '⬇行', group: 'table' },
  { id: 'addColBefore', label: '左方插入欄', icon: '⬅欄', group: 'table' },
  { id: 'addColAfter', label: '右方插入欄', icon: '➡欄', group: 'table' },
  { id: 'deleteCells', label: '刪除選取格', icon: '🗑', group: 'table' },
];

// 圖片尺寸選項
const IMAGE_SIZES = [
  { label: '100%', value: '100%' },
  { label: '75%', value: '75%' },
  { label: '50%', value: '50%' },
  { label: '25%', value: '25%' },
];

// ── 工具列元件 ────────────────────────────────────────────────

interface ToolbarProps {
  onCommand: (id: string) => void;
  onImageUpload: () => void;
  onImageResize: (width: string) => void;
  uploading: boolean;
  showTableTools: boolean;
  showImageTools: boolean;
}

function Toolbar({
  onCommand, onImageUpload, onImageResize,
  uploading, showTableTools, showImageTools,
}: ToolbarProps) {
  const [showGuide, setShowGuide] = useState(false);

  const groups = ['history', 'heading', 'inline', 'block', 'insert'] as const;
  const groupedItems: Record<string, ToolbarItemDef[]> = {};
  for (const item of TOOLBAR_ITEMS) {
    if (!groupedItems[item.group]) groupedItems[item.group] = [];
    groupedItems[item.group].push(item);
  }

  return (
    <div className={styles.toolbar}>
      <div className={styles.toolbarRow}>
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

      {/* 表格編輯工具列 */}
      {showTableTools && (
        <div className={styles.toolbarRowSub}>
          <span className={styles.subLabel}>📊 表格編輯：</span>
          {TABLE_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={styles.toolbarBtnSub}
              title={item.label}
              onClick={() => onCommand(item.id)}
            >
              {item.icon}
            </button>
          ))}
        </div>
      )}

      {/* 圖片縮放工具列 */}
      {showImageTools && (
        <div className={styles.toolbarRowSub}>
          <span className={styles.subLabel}>🖼 圖片寬度：</span>
          {IMAGE_SIZES.map((s) => (
            <button
              key={s.value}
              type="button"
              className={styles.toolbarBtnSub}
              onClick={() => onImageResize(s.value)}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* 快捷鍵指引面板 */}
      {showGuide && (
        <div className={styles.guidePanel}>
          <div className={styles.guidePanelHeader}>
            <span>⌨️ 快捷鍵與 Markdown 語法</span>
            <button type="button" onClick={() => setShowGuide(false)} className={styles.guideClose}>✕</button>
          </div>
          <div className={styles.guideGrid}>
            <div className={styles.guideSection}>
              <h4>鍵盤快捷鍵</h4>
              <div className={styles.guideItem}><kbd>Ctrl+B</kbd> 粗體</div>
              <div className={styles.guideItem}><kbd>Ctrl+I</kbd> 斜體</div>
              <div className={styles.guideItem}><kbd>Ctrl+K</kbd> 插入連結</div>
              <div className={styles.guideItem}><kbd>Ctrl+Z</kbd> 復原</div>
              <div className={styles.guideItem}><kbd>Ctrl+Shift+Z</kbd> 重做</div>
              <div className={styles.guideItem}><kbd>Enter</kbd> 新段落</div>
              <div className={styles.guideItem}><kbd>Shift+Enter</kbd> 換行</div>
              <div className={styles.guideItem}><kbd>Tab</kbd> 縮排</div>
              <div className={styles.guideItem}><kbd>Shift+Tab</kbd> 反縮排</div>
            </div>
            <div className={styles.guideSection}>
              <h4>Markdown 語法（直接輸入）</h4>
              <div className={styles.guideItem}><code># 空格</code> 主標題</div>
              <div className={styles.guideItem}><code>## 空格</code> 次標題</div>
              <div className={styles.guideItem}><code>### 空格</code> 三級標題</div>
              <div className={styles.guideItem}><code>**文字**</code> 粗體</div>
              <div className={styles.guideItem}><code>*文字*</code> 斜體</div>
              <div className={styles.guideItem}><code>~~文字~~</code> 刪除線</div>
              <div className={styles.guideItem}><code>`程式碼`</code> 行內程式碼</div>
              <div className={styles.guideItem}><code>- 空格</code> 項目清單</div>
              <div className={styles.guideItem}><code>1. 空格</code> 編號清單</div>
              <div className={styles.guideItem}><code>&gt; 空格</code> 引用區塊</div>
              <div className={styles.guideItem}><code>---</code> 分隔線</div>
              <div className={styles.guideItem}><code>```語言</code> 程式碼區塊</div>
              <div className={styles.guideItem}><code>[文字](網址)</code> 連結</div>
              <div className={styles.guideItem}><code>![說明](圖片網址)</code> 圖片</div>
            </div>
            <div className={styles.guideSection}>
              <h4>表格語法</h4>
              <div className={styles.guideItem}>用工具列 <b>▦</b> 插入後可直接編輯</div>
              <div className={styles.guideItem}>點擊表格時上方出現表格工具列</div>
              <div className={styles.guideItem}><kbd>Tab</kbd> 跳到下一格</div>
              <div className={styles.guideItem}><kbd>Shift+Tab</kbd> 跳到上一格</div>
            </div>
            <div className={styles.guideSection}>
              <h4>圖片操作</h4>
              <div className={styles.guideItem}>用工具列 <b>📷</b> 上傳圖片</div>
              <div className={styles.guideItem}>點擊圖片後可調整寬度</div>
              <div className={styles.guideItem}>支援複製貼上圖片</div>
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
  const selectedImageRef = useRef<HTMLImageElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showTableTools, setShowTableTools] = useState(false);
  const [showImageTools, setShowImageTools] = useState(false);

  const { get } = useEditor((root) => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, value);

        if (readOnly) {
          ctx.update(editorViewOptionsCtx, (prev) => ({
            ...prev,
            editable: () => false,
          }));
        }

        if (onChange && !readOnly) {
          ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
            onChange(markdown);
          });
        }

        // 縮排設定
        ctx.update(indentConfig.key, (prev) => ({
          ...prev,
          type: 'space' as const,
          size: 2,
        }));
      })
      .config(nord)
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(listener)
      .use(clipboard)
      .use(indent);

    return editor;
  }, []);

  editorGetRef.current = get;

  // ── 偵測點擊位置（表格/圖片）— 使用 DOM 偵測 ──────

  // (checkCursorContext removed — replaced by DOM-based handleEditorClick below)

  // ── 執行編輯器命令 ──────────────────────────────────

  const handleCommand = useCallback((id: string) => {
    const editor = editorGetRef.current?.();
    if (!editor) return;

    editor.action((ctx) => {
      const commands = ctx.get(commandsCtx);

      switch (id) {
        // 歷史
        case 'undo': commands.call(undoCommand.key); break;
        case 'redo': commands.call(redoCommand.key); break;
        // 標題
        case 'h1': commands.call(wrapInHeadingCommand.key, 1); break;
        case 'h2': commands.call(wrapInHeadingCommand.key, 2); break;
        case 'h3': commands.call(wrapInHeadingCommand.key, 3); break;
        case 'paragraph': commands.call(turnIntoTextCommand.key); break;
        // 文字格式
        case 'bold': commands.call(toggleStrongCommand.key); break;
        case 'italic': commands.call(toggleEmphasisCommand.key); break;
        case 'strikethrough': commands.call(toggleStrikethroughCommand.key); break;
        case 'inlineCode': commands.call(toggleInlineCodeCommand.key); break;
        case 'link': {
          const url = prompt('請輸入連結網址：', 'https://');
          if (url) {
            commands.call(toggleLinkCommand.key, { href: url });
          }
          break;
        }
        // 區塊
        case 'bulletList': commands.call(wrapInBulletListCommand.key); break;
        case 'orderedList': commands.call(wrapInOrderedListCommand.key); break;
        case 'blockquote': commands.call(wrapInBlockquoteCommand.key); break;
        case 'codeBlock': commands.call(createCodeBlockCommand.key, 'text'); break;
        case 'hr': commands.call(insertHrCommand.key); break;
        // 表格
        case 'table': commands.call(insertTableCommand.key, { row: 3, col: 3 }); break;
        case 'addRowBefore': commands.call(addRowBeforeCommand.key); break;
        case 'addRowAfter': commands.call(addRowAfterCommand.key); break;
        case 'addColBefore': commands.call(addColBeforeCommand.key); break;
        case 'addColAfter': commands.call(addColAfterCommand.key); break;
        case 'deleteCells': commands.call(deleteSelectedCellsCommand.key); break;
      }
    });
  }, []);

  // ── 圖片上傳 ────────────────────────────────────────

  const handleImageUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const insertImageNode = useCallback((url: string, alt: string) => {
    const editor = editorGetRef.current?.();
    if (!editor) return;

    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const { state, dispatch } = view;
      const imageType = state.schema.nodes.image;
      if (imageType) {
        const node = imageType.create({
          src: url,
          alt: alt,
          title: alt,
        });
        dispatch(state.tr.replaceSelectionWith(node));
      }
    });
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!file.type.startsWith('image/')) {
      alert('請選擇圖片檔案');
      return;
    }
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

      insertImageNode(imageUrl, file.name);
    } catch (err) {
      alert(err instanceof Error ? err.message : '圖片上傳失敗');
    } finally {
      setUploading(false);
    }
  }, [insertImageNode]);

  // ── 圖片縮放（直接操作 DOM）──────────────────────

  const handleImageResize = useCallback((width: string) => {
    const img = selectedImageRef.current;
    if (!img) return;
    img.style.maxWidth = width;
    img.style.width = width;
    img.style.height = 'auto';
  }, []);

  // ── 貼上圖片處理 ────────────────────────────────────

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;

        setUploading(true);
        try {
          const formData = new FormData();
          formData.append('file', file);

          const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
          });

          if (!res.ok) throw new Error('上傳失敗');

          const data = await res.json();
          const imageUrl = data.media?.url;
          if (imageUrl) {
            insertImageNode(imageUrl, file.name || 'pasted-image');
          }
        } catch {
          alert('圖片貼上上傳失敗');
        } finally {
          setUploading(false);
        }
        break;
      }
    }
  }, [insertImageNode]);

  // ── 編輯器點擊事件（DOM 偵測表格/圖片）─────────────

  const handleEditorClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;

    // 偵測是否點擊圖片
    if (target.tagName === 'IMG') {
      selectedImageRef.current = target as HTMLImageElement;
      setShowImageTools(true);
      // 高亮選中的圖片
      target.style.outline = '3px solid var(--color-primary, #557c55)';
      target.style.outlineOffset = '2px';
    } else {
      // 清除上一張圖片的高亮
      if (selectedImageRef.current) {
        selectedImageRef.current.style.outline = '';
        selectedImageRef.current.style.outlineOffset = '';
      }
      selectedImageRef.current = null;
      setShowImageTools(false);
    }

    // 偵測是否在表格內
    let el: HTMLElement | null = target;
    let inTable = false;
    while (el) {
      if (el.tagName === 'TABLE') {
        inTable = true;
        break;
      }
      el = el.parentElement;
    }
    setShowTableTools(inTable);
  }, []);

  const handleEditorKeyUp = useCallback(() => {
    // 鍵盤移動後清除圖片選擇
    if (selectedImageRef.current) {
      selectedImageRef.current.style.outline = '';
      selectedImageRef.current.style.outlineOffset = '';
      selectedImageRef.current = null;
      setShowImageTools(false);
    }
  }, []);

  return (
    <>
      {!readOnly && (
        <Toolbar
          onCommand={handleCommand}
          onImageUpload={handleImageUpload}
          onImageResize={handleImageResize}
          uploading={uploading}
          showTableTools={showTableTools}
          showImageTools={showImageTools}
        />
      )}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        className={readOnly ? styles.editorReadOnly : styles.editorArea}
        onClick={handleEditorClick}
        onKeyUp={handleEditorKeyUp}
        onPaste={!readOnly ? handlePaste : undefined}
      >
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
