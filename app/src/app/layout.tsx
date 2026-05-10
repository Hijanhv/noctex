import type { Metadata } from 'next'
import './globals.css'
import { WalletContextProvider } from '@/components/WalletProvider'
import { Navbar } from '@/components/Navbar'

export const metadata: Metadata = {
  title: 'Noctex — Encrypted Dark Pool',
  description: 'Trade in the dark.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WalletContextProvider>
          <Navbar />
          {children}
        </WalletContextProvider>
      </body>
    </html>
  )
}
