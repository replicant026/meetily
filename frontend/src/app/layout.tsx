import './globals.css'
import { Source_Sans_3 } from 'next/font/google'
import { getStoredLocale } from '@/i18n/request'
import { LocaleProvider } from '@/hooks/useLocale'
import ClientRootLayout from './ClientRootLayout'
import ClientIntlProvider from '@/i18n/ClientIntlProvider'
import { Toaster } from 'sonner'
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from '@/i18n/config'

const sourceSans3 = Source_Sans_3({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-source-sans-3',
})

export { metadata } from './metadata'

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const stored = await getStoredLocale()
  const locale: Locale = isSupportedLocale(stored) ? stored : DEFAULT_LOCALE

  return (
    <html lang={locale}>
      <body className={`${sourceSans3.variable} font-sans antialiased`}>
        <LocaleProvider initial={locale}>
          <ClientIntlProvider>
            <ClientRootLayout>{children}</ClientRootLayout>
          </ClientIntlProvider>
        </LocaleProvider>
        <Toaster position="bottom-center" richColors closeButton />
      </body>
    </html>
  )
}