'use client';

export default function HealthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ padding: '40px', maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
      <h2 style={{ color: '#e53935', marginBottom: '16px' }}>❌ 健康記錄頁面錯誤</h2>
      <p style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>
        錯誤訊息：{error.message}
      </p>
      <pre style={{ fontSize: '11px', color: '#999', background: '#f5f5f5', padding: '12px', borderRadius: '8px', textAlign: 'left', overflow: 'auto', maxHeight: '200px', marginBottom: '16px' }}>
        {error.stack}
      </pre>
      <button
        onClick={reset}
        style={{ padding: '8px 24px', background: '#5a7a5a', color: '#fff', border: 'none', borderRadius: '20px', cursor: 'pointer' }}
      >
        重試
      </button>
    </div>
  );
}
