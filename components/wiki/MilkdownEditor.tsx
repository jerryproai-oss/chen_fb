'use client';

import { Editor, rootCtx, defaultValueCtx, editorViewOptionsCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { history } from '@milkdown/kit/plugin/history';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';
import { nord } from '@milkdown/theme-nord';
import '@milkdown/theme-nord/style.css';

import styles from './MilkdownEditor.module.css';

export interface MilkdownEditorProps {
  /** Initial markdown content */
  value: string;
  /** Called when content changes (not called in readOnly mode) */
  onChange?: (markdown: string) => void;
  /** Read-only mode for viewing */
  readOnly?: boolean;
}

function MilkdownEditorInner({ value, onChange, readOnly }: MilkdownEditorProps) {
  useEditor((root) => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, value);

        // Set read-only mode
        if (readOnly) {
          ctx.update(editorViewOptionsCtx, (prev) => ({
            ...prev,
            editable: () => false,
          }));
        }

        // Listen for markdown changes
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

  return <Milkdown />;
}

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
