'use client';

import dynamic from 'next/dynamic';

// 使用 dynamic import + ssr: false 解決 @dnd-kit ESM 在 production SSR 中
// 的 "ReferenceError: Cannot access 'F' before initialization" 問題
const KanbanBoardContent = dynamic(() => import('./KanbanBoardContent'), {
  ssr: false,
  loading: () => (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '60vh',
      color: '#5a7a5a',
      fontSize: '1rem',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📋</div>
        <div>載入看板中...</div>
      </div>
    </div>
  ),
});

export default function KanbanBoardPage() {
  return <KanbanBoardContent />;
}
