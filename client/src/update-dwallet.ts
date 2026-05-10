/**
 * Refresh the dWallet ID stored in the on-chain DWalletConfig PDA.
 * Used after re-running DKG: the new dWallet ID must replace the old one
 * before sign_settlement can pass the `dwallet.key() == config.dwallet_id`
 * constraint with the freshly DKG'd account.
 *
 * Usage:
 *   bun run src/update-dwallet.ts <NEW_DWALLET_PDA>
 */

import { PublicKey } from "@solana/web3.js";
import {
  getProgram,
  deriveDWalletConfigPda,
  deriveCpiAuthorityPda,
  explorerUrl,
} from "./config.ts";

async function update(newDwalletId: string) {
  const { program, payer } = getProgram();
  const newId = new PublicKey(newDwalletId);
  const [dwalletConfig] = deriveDWalletConfigPda();
  const [cpiAuthority] = deriveCpiAuthorityPda();

  console.log("\n══════════ Noctex: update_dwallet_id ══════════\n");
  console.log("New dWallet ID :", newId.toBase58());
  console.log("Config PDA     :", dwalletConfig.toBase58());
  console.log("CPI authority  :", cpiAuthority.toBase58());
  console.log();

  const sig = await program.methods
    .updateDwalletId(newId)
    .accountsPartial({
      dwalletConfig,
      cpiAuthority,
      authority: payer.publicKey,
    })
    .signers([payer])
    .rpc();

  console.log("✓ DWalletConfig updated");
  console.log("  TX :", explorerUrl(sig));
  console.log();
}

const [arg] = process.argv.slice(2);
if (!arg) {
  console.error("Usage: bun run src/update-dwallet.ts <NEW_DWALLET_PDA>");
  process.exit(1);
}
update(arg).catch((err) => {
  console.error("\x1b[31m✗\x1b[0m", err);
  process.exit(1);
});
