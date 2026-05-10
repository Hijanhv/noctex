import type { Metadata } from 'next'
import './globals.css'
import { WalletContextProvider } from '@/components/WalletProvider'
import { Navbar } from '@/components/Navbar'

export const metadata: Metadata = {
  title: 'NOCTEX — Encrypted Dark Pool',
  description: 'FHE-encrypted order matching · dWallet 2PC-MPC settlement · Solana devnet',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-black overflow-x-hidden">
        <WalletContextProvider>
          <div className="relative z-10">
            <Navbar />
            {children}
          </div>
        </WalletContextProvider>
      </body>
    </html>
  )
}
