'use client'

// Root error boundary — MUST render its own <html> and <body> because the
// root layout is not rendered when this boundary activates.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body>
        <div
          role="alert"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            gap: '1rem',
            padding: '2rem',
            textAlign: 'center',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
            Something went wrong
          </h1>
          <p style={{ color: '#666', maxWidth: '28rem' }}>
            A critical error occurred. Please reload the app.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '0.375rem',
              border: 'none',
              background: '#111',
              color: '#fff',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Reload App
          </button>
          <pre
            style={{
              fontSize: '0.75rem',
              color: '#999',
              maxWidth: '36rem',
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {error.message}
          </pre>
        </div>
      </body>
    </html>
  )
}
