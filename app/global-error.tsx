'use client';

import messages from '@/messages/uk.json';

/** Last resort when the root layout itself fails: no providers or stylesheet are guaranteed, so copy and styles are inline. */
export default function GlobalError() {
  const t = messages.errors;
  return (
    <html lang="uk">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          fontFamily: 'system-ui, sans-serif',
          background: '#f8fafc',
          color: '#0f172a',
        }}
      >
        <main style={{ maxWidth: 420, padding: 24, textAlign: 'center' }}>
          <h1 style={{ fontSize: 24, margin: '0 0 8px' }}>{t.appErrorTitle}</h1>
          <p style={{ margin: '0 0 20px', color: '#475569' }}>
            {t.appErrorDescription}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              height: 44,
              padding: '0 20px',
              border: 0,
              borderRadius: 8,
              background: '#4f46e5',
              color: '#fff',
              fontSize: 16,
              cursor: 'pointer',
            }}
          >
            {t.appErrorReload}
          </button>
        </main>
      </body>
    </html>
  );
}
