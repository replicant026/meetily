'use client'

import React, { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

// ponytail: hardcoded English fallback — class components can't use next-intl hooks.
// Acceptable for unrecoverable error states. Upgrade path: pass translated fallback via wrapper.
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info)
  }

  private handleReload = () => {
    // Tauri reload command may not exist; fall back to browser reload.
    import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke('reload_app').catch(() => window.location.reload()))
      .catch(() => window.location.reload())
  }

  private renderFallback() {
    return (
      <div
        role="alert"
        className="flex flex-col items-center justify-center h-screen gap-4 p-8 text-center"
      >
        <h1 className="text-2xl font-bold">Something went wrong</h1>
        <p className="text-sm opacity-70 max-w-md">
          An unexpected error occurred. Reloading the app usually fixes this.
        </p>
        {this.state.error && (
          <pre className="text-xs opacity-50 max-w-lg overflow-auto whitespace-pre-wrap break-words">
            {this.state.error.message}
          </pre>
        )}
        <button
          type="button"
          onClick={this.handleReload}
          className="rounded-md bg-foreground text-background px-4 py-2 text-sm font-medium"
        >
          Reload App
        </button>
      </div>
    )
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? this.renderFallback()
    }
    return this.props.children
  }
}
