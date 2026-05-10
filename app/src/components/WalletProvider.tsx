'use client'

import { FC, ReactNode, createContext, useContext, useState, useEffect, useCallback } from 'react'
import { ConnectionProvider } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'

const STORAGE_KEY = 'noctex.walletAddress'

type WalletCtx = {
  connected: boolean
  connecting: boolean
  publicKey: PublicKey | null
  connect: () => void
  disconnect: () => void
}

const WalletContext = createContext<WalletCtx>({
  connected: false,
  connecting: false,
  publicKey: null,
  connect: () => {},
  disconnect: () => {},
})

export function useWallet() {
  return useContext(WalletContext)
}

export const WalletContextProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null)
  const [connected, setConnected] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  // Restore previously-entered address from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (!saved) return
      const pk = new PublicKey(saved)
      setPublicKey(pk)
      setConnected(true)
    } catch { /* ignore corrupt storage */ }
  }, [])

  const connect = useCallback(() => setModalOpen(true), [])

  const disconnect = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
    setPublicKey(null)
    setConnected(false)
  }, [])

  const submitAddress = useCallback((addr: string): string | null => {
    const trimmed = addr.trim()
    if (!trimmed) return 'Address required'
    let pk: PublicKey
    try { pk = new PublicKey(trimmed) } catch { return 'Invalid Solana address' }
    if (!PublicKey.isOnCurve(pk.toBytes())) return 'Address is not a valid Ed25519 public key'
    try { localStorage.setItem(STORAGE_KEY, pk.toBase58()) } catch { /* ignore */ }
    setPublicKey(pk)
    setConnected(true)
    setModalOpen(false)
    return null
  }, [])

  return (
    <ConnectionProvider endpoint="https://api.devnet.solana.com">
      <WalletContext.Provider value={{ connected, connecting: false, publicKey, connect, disconnect }}>
        {children}
        {modalOpen && <ConnectModal onClose={() => setModalOpen(false)} onSubmit={submitAddress} />}
      </WalletContext.Provider>
    </ConnectionProvider>
  )
}

const SAMPLE_ADDR = '9nywgQgcSLGb5awMjQ56Gv83hAZ1oGGViB7ADCau3vzx'

const ConnectModal: FC<{ onClose: () => void; onSubmit: (addr: string) => string | null }> = ({ onClose, onSubmit }) => {
  const [addr, setAddr] = useState('')
  const [err, setErr] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const result = onSubmit(addr)
    if (result) setErr(result)
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
    >
      <form
        onClick={e => e.stopPropagation()}
        onSubmit={handleSubmit}
        style={{
          width: 460, maxWidth: '90vw',
          background: '#060606',
          border: '1px solid rgba(0,255,136,0.30)',
          padding: 28,
          fontFamily: "'JetBrains Mono', monospace",
          color: '#f0f0f0',
          position: 'relative',
        }}
      >
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(0,255,136,0.6), transparent)',
        }} />

        <div style={{
          fontFamily: "'Chakra Petch', sans-serif",
          fontSize: 13, fontWeight: 700, letterSpacing: '0.22em', color: '#00ff88',
          marginBottom: 4,
        }}>
          CONNECT WALLET
        </div>
        <div style={{ fontSize: 10, letterSpacing: '0.08em', color: '#707070', marginBottom: 18 }}>
          Paste your Phantom devnet address to identify your orders
        </div>

        <label style={{ fontSize: 9, letterSpacing: '0.14em', color: '#b0b0b0', textTransform: 'uppercase' }}>
          Solana Address
        </label>
        <input
          autoFocus
          spellCheck={false}
          autoComplete="off"
          value={addr}
          onChange={e => { setAddr(e.target.value); setErr(null) }}
          placeholder={SAMPLE_ADDR}
          style={{
            width: '100%', marginTop: 6, marginBottom: 6,
            padding: '11px 12px',
            background: '#0c0c0c',
            border: `1px solid ${err ? '#ff3d6b' : 'rgba(0,255,136,0.18)'}`,
            color: err ? '#ff3d6b' : '#00ff88',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12, letterSpacing: '0.02em',
            outline: 'none',
          }}
        />
        <div style={{ minHeight: 14, fontSize: 9, color: '#ff3d6b', letterSpacing: '0.06em' }}>
          {err ?? ' '}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1, padding: '11px 0',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.10)',
              color: '#b0b0b0',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!addr.trim()}
            style={{
              flex: 2, padding: '11px 0',
              background: addr.trim() ? 'rgba(0,255,136,0.12)' : 'transparent',
              border: `1px solid ${addr.trim() ? '#00ff88' : 'rgba(0,255,136,0.20)'}`,
              color: addr.trim() ? '#00ff88' : '#707070',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
              cursor: addr.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            Connect
          </button>
        </div>

        <div style={{
          marginTop: 18, paddingTop: 14,
          borderTop: '1px solid rgba(255,255,255,0.06)',
          fontSize: 9, color: '#707070', letterSpacing: '0.06em', lineHeight: 1.6,
        }}>
          <span style={{ color: '#00ff88', opacity: 0.7 }}>◈</span>{' '}
          Address is stored locally in this browser. Transactions are signed off-platform via the Noctex CLI client (Anchor + Phantom keypair).
        </div>
      </form>
    </div>
  )
}
