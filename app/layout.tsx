import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'Smartstay · Hotel Operating System',
  description: 'AI-native hospitality operating system: Contact Center, CRM, Operations, Storage, AI Team and Analytics.',
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect x='5' y='5' width='22' height='22' rx='4' fill='%23101315' stroke='%2363b8ad' stroke-width='2'/%3E%3Cpath d='M10 10h3v3h-3zm0 6h3v3h-3zm0 6h3v3h-3zm6-12h3v3h-3zm0 6h3v3h-3zm0 6h6v3h-6z' fill='%2363b8ad'/%3E%3C/svg%3E",
  },
}

export const viewport: Viewport = { themeColor: '#101315', colorScheme: 'dark' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  )
}
