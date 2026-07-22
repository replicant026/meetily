'use client'

import { NextIntlClientProvider } from 'next-intl'
import { useLocale } from '@/hooks/useLocale'
import { loadMessages } from './request'
import { ReactNode } from 'react'

export default function ClientIntlProvider({ children }: { children: ReactNode }) {
  const { locale } = useLocale()
  const messages = loadMessages(locale)
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  )
}
