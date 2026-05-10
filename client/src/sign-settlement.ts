/**
 * Invoke `sign_settlement` for a settled pair, producing a real Ika
 * MessageApproval PDA via 2PC-MPC mock signer.
 *
 * Usage:
 *   bun run src/sign-settlement.ts <BUY_ORDER> <SELL_ORDER> <DWALLET_PUBKEY_HEX>
 *
 * The dWallet pubkey hex is what the Rust bootstrap printed as
 * "dWallet public key" (32-byte Ed25519 public key, NOT the Solana address).
 * Both orders must be in Settled state and matched to each other.
 */

import { PublicKey, SystemProgram } from "@solana/web3.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import {
  getProgram,
  deriveDWalletConfigPda,
  deriveCpiAuthorityPda,
  deriveMessageApprovalPda,
  CURVE_CURVE25519,
  SIG_EDDSA_SHA_512,
  IKA_PROGRAM_ID,
  NOCTEX_PROGRAM_ID,
  explorerUrl,
  explorerAccountUrl,
} from "./config.ts";

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, "");
  if (clean.length !== 64) {
    throw new Error(`expected 32-byte (64 hex char) pubkey, got ${clean.length}`);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function deriveCoordinatorPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("dwallet_coordinator")],
    IKA_PROGRAM_ID,
  );
}

async function signSettlement(
  buyArg: string,
  sellArg: string,
  dwalletPubkeyHex: string,
) {
  const { program, payer } = getProgram();
  const buyOrder = new PublicKey(buyArg);
  const sellOrder = new PublicKey(sellArg);
  const dwalletPubkey = hexToBytes(dwalletPubkeyHex);

  // Settlement message — keccak256("noctex-settlement-v0|" + buy + "|" + sell)
  // The off-chain Ika network signs this digest. In production it would
  // include the encrypted-output references too.
  const message = Buffer.from(
    `noctex-settlement-v0|${buyOrder.toBase58()}|${sellOrder.toBase58()}`,
  );
  // Ika uses keccak256 server-side to look up MessageApproval at Sign time
  // (verified from voting/e2e-rust:404 `simple_keccak256`). Both sides MUST
  // use the same hash so the seed-derived PDA address matches.
  const messageDigest = Buffer.from(keccak_256(message));

  const metadataDigest = new Uint8Array(32); // all zeros = excluded from PDA seeds

  const [dwalletConfig] = deriveDWalletConfigPda();
  const [cpiAuthority] = deriveCpiAuthorityPda();
  const [coordinator] = deriveCoordinatorPda();

  // The DWalletConfig stores the dWallet's Solana address; we read it.
  const cfgInfo = await program.provider.connection.getAccountInfo(dwalletConfig);
  if (!cfgInfo) {
    throw new Error("DWalletConfig not initialized — run init-dwallet.ts first.");
  }
  // Anchor account layout: 8-byte disc + 32 dwallet_id + 32 authority + 1 bump + 1 cpi_authority_bump
  const dwallet = new PublicKey(cfgInfo.data.subarray(8, 40));

  const [messageApproval, messageApprovalBump] = deriveMessageApprovalPda(
    CURVE_CURVE25519,
    dwalletPubkey,
    SIG_EDDSA_SHA_512,
    messageDigest,
    metadataDigest,
  );

  console.log("\n══════════ Noctex: sign_settlement (LIVE Ika) ══════════\n");
  console.log("Buy  order        :", buyOrder.toBase58());
  console.log("Sell order        :", sellOrder.toBase58());
  console.log("dWallet (Solana)  :", dwallet.toBase58());
  console.log("dWallet pubkey    :", dwalletPubkeyHex);
  console.log("Curve / scheme    :", "Curve25519 / EddsaSha512");
  console.log("Message           :", message.toString());
  console.log("Message digest    :", messageDigest.toString("hex"));
  console.log("MessageApproval   :", messageApproval.toBase58(), `(bump ${messageApprovalBump})`);
  console.log("Coordinator PDA   :", coordinator.toBase58());
  console.log();

  const sig = await program.methods
    .signSettlement(
      messageApprovalBump,
      Array.from(messageDigest) as any,
      Array.from(metadataDigest) as any,
      payer.publicKey,
      SIG_EDDSA_SHA_512,
    )
    .accountsPartial({
      dwalletConfig,
      buyOrder,
      sellOrder,
      coordinator,
      messageApproval,
      dwallet,
      callerProgram: NOCTEX_PROGRAM_ID,
      cpiAuthority,
      payer: payer.publicKey,
      systemProgram: SystemProgram.programId,
      ikaProgram: IKA_PROGRAM_ID,
    })
    .signers([payer])
    .rpc();

  console.log("✓ sign_settlement succeeded");
  console.log("  TX             :", explorerUrl(sig));
  console.log("  MessageApproval:", explorerAccountUrl(messageApproval));
  console.log();
  console.log("The Ika network will now produce the 2PC-MPC signature off-chain,");
  console.log("and the NOA will commit it to the MessageApproval account (status=Signed).");
  console.log();
}

const [buy, sell, dwalletPk] = process.argv.slice(2);
if (!buy || !sell || !dwalletPk) {
  console.error("Usage: bun run src/sign-settlement.ts <BUY> <SELL> <DWALLET_PUBKEY_HEX>");
  process.exit(1);
}
signSettlement(buy, sell, dwalletPk).catch((err) => {
  console.error("\x1b[31m✗\x1b[0m", err);
  process.exit(1);
});
