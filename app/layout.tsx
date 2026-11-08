import type { Metadata } from 'next'
import './globals.css'
import { ThemeProvider } from '@/components/shell/theme-provider'
import { Toaster } from '@/components/shell/toast'

export const metadata: Metadata = {
  title: 'AgentForge',
  description: 'Design, run, test and deploy multi-agent graphs',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className="h-full antialiased">
        <ThemeProvider attribute="data-theme" defaultTheme="dark" enableSystem disableTransitionOnChange>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
