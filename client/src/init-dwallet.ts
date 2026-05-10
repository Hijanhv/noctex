/**
 * One-time setup: initialize the DWalletConfig PDA on Noctex with an Ika dWallet ID.
 *
 * Usage:
 *   bun run src/init-dwallet.ts <IKA_DWALLET_ID_BASE58>
 *
 * In a real flow the dWallet is created off-chain via Ika's gRPC DKG, then its
 * authority is transferred to our cpi_authority PDA (seed b"__ika_cpi_authority").
 * After that, this script records the dWallet ID on Noctex so sign_settlement can
 * find it. For demo purposes you can pass any pubkey to populate the config and
 * exercise the wiring.
 */

import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  getProgram,
  deriveDWalletConfigPda,
  deriveCpiAuthorityPda,
  explorerUrl,
  explorerAccountUrl,
} from "./config.ts";

async function initDwallet(dwalletIdArg: string) {
  const { program, payer } = getProgram();
  const dwalletId = new PublicKey(dwalletIdArg);
  const [dwalletConfig] = deriveDWalletConfigPda();
  const [cpiAuthority, cpiAuthorityBump] = deriveCpiAuthorityPda();

  console.log("\n══════════ Noctex: initialize_dwallet ══════════\n");
  console.log("dWallet ID    :", dwalletId.toBase58());
  console.log("Config PDA    :", dwalletConfig.toBase58());
  console.log("CPI authority :", cpiAuthority.toBase58(), `(bump ${cpiAuthorityBump})`);
  console.log("Authority     :", payer.publicKey.toBase58());
  console.log();

  const existing = await program.provider.connection.getAccountInfo(dwalletConfig);
  if (existing) {
    console.log("⚠  dwallet_config already initialized — skipping.");
    console.log("   View:", explorerAccountUrl(dwalletConfig));
    return;
  }

  const sig = await program.methods
    .initializeDwallet(dwalletId)
    .accountsPartial({
      dwalletConfig,
      cpiAuthority,
      authority: payer.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([payer])
    .rpc();

  console.log("✓ DWalletConfig initialized");
  console.log("  TX     :", explorerUrl(sig));
  console.log("  Config :", explorerAccountUrl(dwalletConfig));
  console.log();
}

const [dwalletIdArg] = process.argv.slice(2);
if (!dwalletIdArg) {
  console.error("Usage: bun run src/init-dwallet.ts <IKA_DWALLET_ID_BASE58>");
  process.exit(1);
}

initDwallet(dwalletIdArg).catch((err) => {
  console.error("\x1b[31m✗\x1b[0m", err);
  process.exit(1);
});
