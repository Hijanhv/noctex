'use client'

import { createContext, useContext, useState, useEffect, FC, ReactNode } from 'react'

interface WalletCtx {
  connected: boolean
  publicKey: string | null
}

const WalletCtx = createContext<WalletCtx>({ connected: false, publicKey: null })

export const useWallet = () => useContext(WalletCtx)

export const WalletContextProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [publicKey, setPublicKey] = useState<string | null>(null)

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = (window as any)?.phantom?.solana
    if (!p?.isPhantom) return

    if (p.isConnected && p.publicKey) {
      setPublicKey(p.publicKey.toString())
    }

    const onConnect = (pk: { toString(): string }) => setPublicKey(pk.toString())
    const onDisconnect = () => setPublicKey(null)
    p.on?.('connect', onConnect)
    p.on?.('disconnect', onDisconnect)
    return () => {
      p.off?.('connect', onConnect)
      p.off?.('disconnect', onDisconnect)
    }
  }, [])

  return (
    <WalletCtx.Provider value={{ connected: !!publicKey, publicKey }}>
      {children}
    </WalletCtx.Provider>
  )
}
