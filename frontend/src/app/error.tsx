'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('errors')

  useEffect(() => {
    console.error('App route error:', error)
  }, [error])

  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center h-screen gap-4 p-8 text-center"
    >
      <h1 className="text-2xl font-bold">{t('error_boundary_title')}</h1>
      <p className="text-sm opacity-70 max-w-md">{t('error_boundary_description')}</p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-foreground text-background px-4 py-2 text-sm font-medium"
      >
        {t('error_boundary_reset')}
      </button>
    </div>
  )
}
