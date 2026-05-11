/**
 * Browser-side Noctex program client.
 *
 * Wraps `@coral-xyz/anchor` with a thin Phantom adapter so we can call
 * the on-chain instructions directly from the React app. The injected
 * Phantom provider (`window.phantom.solana`) is the source of truth for
 * the signer — the wallet-adapter library's Standard Wallet detection
 * is brittle under Phantom's SES lockdown in Next.js dev mode, so we
 * talk to Phantom directly.
 *
 * Two factories live here:
 *   - `getReadOnlyProgram()`  — no wallet needed; for fetching Order
 *     PDAs / config accounts on a page load.
 *   - `getProgramWithPhantom()` — wraps the connected Phantom wallet as
 *     an Anchor `Wallet`-like object that can sign transactions.
 */

import {
  AnchorProvider,
  Program,
  Wallet as AnchorWallet,
} from '@coral-xyz/anchor'
import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from '@solana/web3.js'

import idl from './noctex-idl.json'
import type { Noctex } from './noctex-types'

export const SOLANA_RPC = 'https://api.devnet.solana.com'
export const ENCRYPT_GRPC_WEB = 'https://pre-alpha-dev-1.encrypt.ika-network.net'
export const NOCTEX_PROGRAM_ID = new PublicKey(idl.address)
export const ENCRYPT_PROGRAM_ID = new PublicKey(
  '4ebfzWdKnrnGseuQpezXdG8yCdHqwQ1SSBHD3bWArND8',
)
export const IKA_PROGRAM_ID = new PublicKey(
  '87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY',
)

export const FHE_TYPE_EUINT64 = 4
export const PRE_ALPHA_NETWORK_KEY = new Uint8Array(32).fill(0x55)

export const ORDER_SEED = Buffer.from('order')
export const DWALLET_CONFIG_SEED = Buffer.from('dwallet-config')
export const ENCRYPT_CPI_AUTHORITY_SEED = Buffer.from('__encrypt_cpi_authority')
export const ENCRYPT_CONFIG_SEED = Buffer.from('encrypt_config')
export const ENCRYPT_DEPOSIT_SEED = Buffer.from('encrypt_deposit')
export const ENCRYPT_EVENT_AUTHORITY_SEED = Buffer.from('__event_authority')
export const ENCRYPT_NETWORK_KEY_SEED = Buffer.from('network_encryption_key')

export function getConnection() {
  return new Connection(SOLANA_RPC, 'confirmed')
}

// ── PDA derivations (mirrors client/src/config.ts) ──

export function deriveOrderPda(owner: PublicKey, nonce: bigint): [PublicKey, number] {
  const nonceBuf = Buffer.alloc(8)
  nonceBuf.writeBigUInt64LE(nonce)
  return PublicKey.findProgramAddressSync(
    [ORDER_SEED, owner.toBuffer(), nonceBuf],
    NOCTEX_PROGRAM_ID,
  )
}

export function deriveDWalletConfigPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([DWALLET_CONFIG_SEED], NOCTEX_PROGRAM_ID)
}

export function deriveEncryptCpiAuthorityPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [ENCRYPT_CPI_AUTHORITY_SEED],
    NOCTEX_PROGRAM_ID,
  )
}

export function deriveEncryptConfigPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([ENCRYPT_CONFIG_SEED], ENCRYPT_PROGRAM_ID)
}

export function deriveEncryptEventAuthorityPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [ENCRYPT_EVENT_AUTHORITY_SEED],
    ENCRYPT_PROGRAM_ID,
  )
}

export function deriveEncryptDepositPda(payer: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [ENCRYPT_DEPOSIT_SEED, payer.toBuffer()],
    ENCRYPT_PROGRAM_ID,
  )
}

export function deriveEncryptNetworkKeyPda(
  key: Uint8Array = PRE_ALPHA_NETWORK_KEY,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [ENCRYPT_NETWORK_KEY_SEED, Buffer.from(key)],
    ENCRYPT_PROGRAM_ID,
  )
}

/** Encrypt 17-byte mock ciphertext: `[fhe_type || value_le(16)]`. */
export function mockCiphertextBytes(value: bigint, fheType: number): Uint8Array {
  const buf = new Uint8Array(17)
  buf[0] = fheType
  let v = value
  for (let i = 0; i < 16; i++) {
    buf[1 + i] = Number(v & 0xffn)
    v >>= 8n
  }
  return buf
}

// ── Anchor program factories ──

/** Read-only — for fetching accounts; cannot sign. */
export function getReadOnlyProgram(): Program<Noctex> {
  const connection = getConnection()
  const dummyWallet = {
    publicKey: PublicKey.default,
    signTransaction: async (tx: unknown) => tx,
    signAllTransactions: async (txs: unknown[]) => txs,
  } as unknown as AnchorWallet
  const provider = new AnchorProvider(connection as never, dummyWallet, {
    commitment: 'confirmed',
  })
  return new Program<Noctex>(idl as Noctex, provider)
}

// ── Phantom adapter ──

type PhantomProvider = {
  isPhantom?: boolean
  isConnected?: boolean
  publicKey?: { toString(): string; toBytes(): Uint8Array }
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: PhantomProvider['publicKey'] }>
  signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>
  signAllTransactions: <T extends Transaction | VersionedTransaction>(txs: T[]) => Promise<T[]>
}

export function getPhantom(): PhantomProvider | null {
  if (typeof window === 'undefined') return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = (window as any)?.phantom?.solana ?? null
  return p && p.isPhantom ? (p as PhantomProvider) : null
}

/**
 * Build a program bound to the live Phantom wallet. Throws if Phantom
 * isn't installed/connected — callers should gate this behind a
 * "wallet connected" check.
 */
export async function getProgramWithPhantom(): Promise<{
  program: Program<Noctex>
  publicKey: PublicKey
  provider: AnchorProvider
}> {
  const phantom = getPhantom()
  if (!phantom) throw new Error('Phantom wallet not detected — install it from phantom.app')

  if (!phantom.isConnected || !phantom.publicKey) {
    await phantom.connect()
  }
  const pkString = phantom.publicKey!.toString()
  const publicKey = new PublicKey(pkString)

  const anchorWallet = {
    publicKey,
    signTransaction: async (tx: unknown) => phantom.signTransaction(tx as Transaction),
    signAllTransactions: async (txs: unknown[]) =>
      phantom.signAllTransactions(txs as Transaction[]),
  } as unknown as AnchorWallet

  const connection = getConnection()
  const provider = new AnchorProvider(connection as never, anchorWallet, {
    commitment: 'confirmed',
  })
  const program = new Program<Noctex>(idl as Noctex, provider)
  return { program, publicKey, provider }
}

export function explorerTx(sig: string): string {
  return `https://explorer.solana.com/tx/${sig}?cluster=devnet`
}

export function explorerAccount(addr: PublicKey | string): string {
  const a = typeof addr === 'string' ? addr : addr.toBase58()
  return `https://explorer.solana.com/address/${a}?cluster=devnet`
}
