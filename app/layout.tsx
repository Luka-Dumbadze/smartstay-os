import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'Smartstay OS · Chateau Telavi',
  description: 'AI-native hospitality operating system: Contact Center, CRM, Operations, Storage, AI Team and Analytics.',
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%235e5ce6'/%3E%3Cstop offset='1' stop-color='%23bf5af2'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='32' height='32' rx='9' fill='url(%23g)'/%3E%3Cpath d='M16 7l2.2 5.8L24 15l-5.8 2.2L16 23l-2.2-5.8L8 15l5.8-2.2z' fill='white'/%3E%3C/svg%3E",
  },
}

export const viewport: Viewport = { themeColor: '#0c0c0e', colorScheme: 'dark' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  )
}
