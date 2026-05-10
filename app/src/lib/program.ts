import { PublicKey } from '@solana/web3.js'

export const NOCTEX_PROGRAM_ID = new PublicKey('833YAgrbapXnLiYkUq6tG6hWfZ7whX34Xs7CtBN8Nrvx')
export const SOLANA_RPC = 'https://api.devnet.solana.com'
export const ORDER_SEED = Buffer.from('order')

export function deriveOrderPda(owner: PublicKey, nonce: bigint): [PublicKey, number] {
  const nonceBuf = Buffer.alloc(8)
  nonceBuf.writeBigUInt64LE(nonce)
  return PublicKey.findProgramAddressSync(
    [ORDER_SEED, owner.toBuffer(), nonceBuf],
    NOCTEX_PROGRAM_ID,
  )
}
