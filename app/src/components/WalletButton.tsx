'use client'

import { useState, useEffect } from 'react'

type Status = 'checking' | 'no-phantom' | 'idle' | 'connecting' | 'connected'

function getPhantom() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any)?.phantom?.solana ?? null
}

export function WalletButton() {
  const [pubkey, setPubkey] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('checking')

  useEffect(() => {
    const p = getPhantom()
    if (!p?.isPhantom) {
      setStatus('no-phantom')
      return
    }
    if (p.isConnected && p.publicKey) {
      setPubkey(p.publicKey.toString())
      setStatus('connected')
    } else {
      setStatus('idle')
    }
    const onConnect = (pk: { toString(): string }) => {
      setPubkey(pk.toString())
      setStatus('connected')
    }
    const onDisconnect = () => {
      setPubkey(null)
      setStatus('idle')
    }
    p.on?.('connect', onConnect)
    p.on?.('disconnect', onDisconnect)
    return () => {
      p.off?.('connect', onConnect)
      p.off?.('disconnect', onDisconnect)
    }
  }, [])

  function handleConnect() {
    const p = getPhantom()
    if (!p?.isPhantom) {
      window.open('https://phantom.app/', '_blank')
      return
    }

    // p.connect() MUST be the first call — user gesture context is consumed here.
    // onlyIfTrusted:false forces the approval popup even if the site was approved before.
    p.connect({ onlyIfTrusted: false })
      .then((resp: { publicKey: { toString(): string } }) => {
        setPubkey(resp.publicKey.toString())
        setStatus('connected')
      })
      .catch(() => {
        // Phantom sometimes throws during the unlock flow but IS connected
        setTimeout(() => {
          const p2 = getPhantom()
          if (p2?.isConnected && p2?.publicKey) {
            setPubkey(p2.publicKey.toString())
            setStatus('connected')
          } else {
            setStatus('idle')
          }
        }, 1000)
      })

    // State update after the connect call so user gesture isn't broken
    setStatus('connecting')
  }

  function handleDisconnect() {
    const p = getPhantom()
    p?.disconnect().catch(() => {})
    setPubkey(null)
    setStatus('idle')
  }

  if (status === 'checking') {
    return (
      <button disabled style={idleStyle(true)}>
        <PhantomIcon />CONNECT PHANTOM
      </button>
    )
  }

  if (status === 'no-phantom') {
    return (
      <button
        onClick={() => window.open('https://phantom.app/', '_blank')}
        style={idleStyle(false)}
        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'rgba(0,255,136,0.10)')}
        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
      >
        <PhantomIcon />GET PHANTOM ↗
      </button>
    )
  }

  if (status === 'connecting') {
    return (
      <button disabled style={idleStyle(true)}>
        <PhantomIcon />APPROVE IN PHANTOM…
      </button>
    )
  }

  if (status === 'connected' && pubkey) {
    return (
      <button onClick={handleDisconnect} style={connectedStyle}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#00ff88', display: 'inline-block', flexShrink: 0 }} />
        {pubkey.slice(0, 4)}…{pubkey.slice(-4)}
      </button>
    )
  }

  return (
    <button
      onClick={handleConnect}
      style={idleStyle(false)}
      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'rgba(0,255,136,0.10)')}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
    >
      <PhantomIcon />CONNECT PHANTOM
    </button>
  )
}

const base: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  fontFamily: "'JetBrains Mono',monospace",
  fontSize: 10, letterSpacing: '0.12em', padding: '7px 14px', cursor: 'pointer',
  border: '1px solid rgba(0,255,136,0.28)', background: 'transparent', color: '#00ff88',
}

function idleStyle(disabled: boolean): React.CSSProperties {
  return { ...base, cursor: disabled ? 'wait' : 'pointer', opacity: disabled ? 0.55 : 1 }
}

const connectedStyle: React.CSSProperties = {
  ...base,
  background: 'rgba(0,255,136,0.08)',
  border: '1px solid rgba(0,255,136,0.4)',
  cursor: 'pointer',
}

function PhantomIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 128 128" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="64" cy="64" r="64" fill="#ab9ff2" />
      <path d="M108 62c0-24.3-19.7-44-44-44S20 37.7 20 62c0 12.5 5.2 23.8 13.6 31.9C38.5 98.5 45.1 107 64 107c8.3 0 15.8-2.2 21.5-6C97.8 94 108 79.4 108 62z" fill="#fff" />
      <ellipse cx="47" cy="64" rx="8" ry="10" fill="#ab9ff2" />
      <ellipse cx="81" cy="64" rx="8" ry="10" fill="#ab9ff2" />
    </svg>
  )
}
