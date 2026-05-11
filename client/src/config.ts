import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import * as fs from "node:fs";
import * as path from "node:path";
import noctexIdl from "../../target/idl/noctex.json" with { type: "json" };
import type { Noctex } from "../../target/types/noctex.ts";

export const SOLANA_RPC = "https://api.devnet.solana.com";
export const ENCRYPT_GRPC = "pre-alpha-dev-1.encrypt.ika-network.net:443";
export const ENCRYPT_PROGRAM_ID = new PublicKey(
  "4ebfzWdKnrnGseuQpezXdG8yCdHqwQ1SSBHD3bWArND8",
);
export const IKA_PROGRAM_ID = new PublicKey(
  "87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY",
);
export const NOCTEX_PROGRAM_ID = new PublicKey(noctexIdl.address);

export const NOCTEX_CPI_AUTHORITY_SEED = Buffer.from("__ika_cpi_authority");
export const ENCRYPT_CPI_AUTHORITY_SEED = Buffer.from("__encrypt_cpi_authority");
export const DWALLET_CONFIG_SEED = Buffer.from("dwallet-config");
export const ORDER_SEED = Buffer.from("order");

// ── Encrypt PDA seeds (verified from the SDK e2e examples) ──
export const ENCRYPT_CONFIG_SEED = Buffer.from("encrypt_config");
export const ENCRYPT_DEPOSIT_SEED = Buffer.from("encrypt_deposit");
export const ENCRYPT_EVENT_AUTHORITY_SEED = Buffer.from("__event_authority");
export const ENCRYPT_NETWORK_KEY_SEED = Buffer.from("network_encryption_key");

/**
 * Pre-alpha network encryption key — fixed 32-byte mock used by the devnet
 * executor (matches the constant `Buffer.alloc(32, 0x55)` in the SDK e2e demos).
 * In production this will be the live network's public key.
 */
export const PRE_ALPHA_NETWORK_KEY = Buffer.alloc(32, 0x55);

/** FHE type discriminator: EUint64 = 4 (from encrypt-types/types.rs). */
export const FHE_TYPE_EUINT64 = 4;

export function loadKeypair(filepath?: string): Keypair {
  const keyPath =
    filepath ?? path.join(process.env.HOME!, ".config/solana/id.json");
  const raw = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
  return Keypair.fromSecretKey(new Uint8Array(raw));
}

export function getConnection(): Connection {
  return new Connection(SOLANA_RPC, "confirmed");
}

export function getProgram(payer = loadKeypair()): {
  program: Program<Noctex>;
  provider: AnchorProvider;
  payer: Keypair;
} {
  const connection = getConnection();
  const wallet = new Wallet(payer);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  const program = new Program<Noctex>(noctexIdl as Noctex, provider);
  return { program, provider, payer };
}

export function deriveOrderPda(
  owner: PublicKey,
  nonce: bigint,
): [PublicKey, number] {
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeBigUInt64LE(nonce);
  return PublicKey.findProgramAddressSync(
    [ORDER_SEED, owner.toBuffer(), nonceBuf],
    NOCTEX_PROGRAM_ID,
  );
}

export function deriveDWalletConfigPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [DWALLET_CONFIG_SEED],
    NOCTEX_PROGRAM_ID,
  );
}

export function deriveCpiAuthorityPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [NOCTEX_CPI_AUTHORITY_SEED],
    NOCTEX_PROGRAM_ID,
  );
}

/** PDA of our Encrypt CPI authority (seed = b"__encrypt_cpi_authority"). */
export function deriveEncryptCpiAuthorityPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [ENCRYPT_CPI_AUTHORITY_SEED],
    NOCTEX_PROGRAM_ID,
  );
}

/** Encrypt program PDAs (seeds verified from SDK e2e demos). */
export function deriveEncryptConfigPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [ENCRYPT_CONFIG_SEED],
    ENCRYPT_PROGRAM_ID,
  );
}

export function deriveEncryptEventAuthorityPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [ENCRYPT_EVENT_AUTHORITY_SEED],
    ENCRYPT_PROGRAM_ID,
  );
}

/** One deposit PDA per payer — must be initialized once before any CPI. */
export function deriveEncryptDepositPda(payer: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [ENCRYPT_DEPOSIT_SEED, payer.toBuffer()],
    ENCRYPT_PROGRAM_ID,
  );
}

export function deriveEncryptNetworkKeyPda(
  networkKey: Uint8Array = PRE_ALPHA_NETWORK_KEY,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [ENCRYPT_NETWORK_KEY_SEED, Buffer.from(networkKey)],
    ENCRYPT_PROGRAM_ID,
  );
}

/**
 * Pack a u64 value into the 17-byte mock-ciphertext format the pre-alpha
 * executor expects: `[fhe_type(1) || value_le(16)]`. The 16-byte field
 * tail is little-endian and 0-padded for types narrower than u128.
 */
export function mockCiphertextBytes(value: bigint, fheType: number): Uint8Array {
  const buf = new Uint8Array(17);
  buf[0] = fheType;
  let v = value;
  for (let i = 0; i < 16; i++) {
    buf[1 + i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return buf;
}

/** Curve constants — match DWalletCurve discriminants in ika-dwallet-types. */
export const CURVE_SECP256K1 = 0;
export const CURVE_SECP256R1 = 1;
export const CURVE_CURVE25519 = 2;
export const CURVE_RISTRETTO = 3;

/** Signature scheme constants — match DWalletSignatureScheme. */
export const SIG_ECDSA_KECCAK_256 = 0;
export const SIG_ECDSA_SHA_256 = 1;
export const SIG_ECDSA_DOUBLE_SHA_256 = 2;
export const SIG_TAPROOT_SHA_256 = 3;
export const SIG_ECDSA_BLAKE2B_256 = 4;
export const SIG_EDDSA_SHA_512 = 5;
export const SIG_SCHNORRKEL_MERLIN = 6;

/**
 * Pack `curve_u16_le || pubkey` for Ika dWallet PDA seeds. Solana caps each
 * seed at 32 bytes; callers split this buffer into chunks. Mirrors the
 * `pack_dwallet_seed_payload` helper in voting/e2e-rust.
 */
function packDwalletSeedPayload(curve: number, publicKey: Uint8Array): Buffer {
  const buf = Buffer.alloc(2 + publicKey.length);
  buf.writeUInt16LE(curve, 0);
  buf.set(publicKey, 2);
  return buf;
}

function chunkInto(buf: Buffer, size: number): Buffer[] {
  const out: Buffer[] = [];
  for (let i = 0; i < buf.length; i += size) {
    out.push(buf.subarray(i, Math.min(i + size, buf.length)));
  }
  return out;
}

/**
 * Derive the on-chain Ika dWallet PDA from its curve and cryptographic key.
 *   seeds = [b"dwallet", chunks_of(curve_u16_le || pubkey)]
 *   program = Ika program
 */
export function deriveDwalletAccountPda(
  curve: number,
  publicKey: Uint8Array,
): [PublicKey, number] {
  const payload = packDwalletSeedPayload(curve, publicKey);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("dwallet"), ...chunkInto(payload, 32)],
    IKA_PROGRAM_ID,
  );
}

/**
 * Derive the Ika MessageApproval PDA. Verified from voting/e2e-rust:411-424.
 *   seeds = [b"dwallet", chunks_of(curve_u16_le || pubkey),
 *            b"message_approval", scheme_u16_le, message_digest,
 *            (metadata_digest if non-zero)]
 *   program = Ika program
 *
 * Uses the cryptographic dWallet public key (32 bytes from DKG), NOT the
 * Solana account address — the Ika program identifies a dWallet by curve+pk.
 */
export function deriveMessageApprovalPda(
  curve: number,
  dwalletPublicKey: Uint8Array,
  signatureScheme: number,
  messageDigest: Uint8Array,
  messageMetadataDigest?: Uint8Array,
): [PublicKey, number] {
  if (messageDigest.length !== 32) {
    throw new Error("message_digest must be 32 bytes");
  }
  const payload = packDwalletSeedPayload(curve, dwalletPublicKey);
  const schemeBuf = Buffer.alloc(2);
  schemeBuf.writeUInt16LE(signatureScheme);

  const seeds: Buffer[] = [
    Buffer.from("dwallet"),
    ...chunkInto(payload, 32),
    Buffer.from("message_approval"),
    schemeBuf,
    Buffer.from(messageDigest),
  ];

  if (
    messageMetadataDigest &&
    messageMetadataDigest.length === 32 &&
    !messageMetadataDigest.every((b) => b === 0)
  ) {
    seeds.push(Buffer.from(messageMetadataDigest));
  }

  return PublicKey.findProgramAddressSync(seeds, IKA_PROGRAM_ID);
}

export function explorerUrl(sig: string): string {
  return `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
}

export function explorerAccountUrl(addr: PublicKey | string): string {
  const a = typeof addr === "string" ? addr : addr.toBase58();
  return `https://explorer.solana.com/address/${a}?cluster=devnet`;
}
