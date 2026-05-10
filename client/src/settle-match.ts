/**
 * Settle a matched pair after the (would-be) FHE executor returns output ciphertexts.
 *
 * Usage:
 *   bun run src/settle-match.ts <BUY_ORDER_PDA> <SELL_ORDER_PDA>
 *
 * Generates random output ciphertext pubkeys as placeholders. In a full pipeline
 * these come from the Encrypt executor's commit phase after match_orders runs.
 */

import { Keypair, PublicKey } from "@solana/web3.js";
import { getProgram, explorerUrl } from "./config.ts";

async function settleMatch(buyArg: string, sellArg: string) {
  const { program, payer } = getProgram();
  const buyOrder = new PublicKey(buyArg);
  const sellOrder = new PublicKey(sellArg);

  const outputPrice = Keypair.generate().publicKey;
  const outputAmount = Keypair.generate().publicKey;

  console.log("\n══════════ Noctex: settle_match ══════════\n");
  console.log("Buy  order   :", buyOrder.toBase58());
  console.log("Sell order   :", sellOrder.toBase58());
  console.log("Output price :", outputPrice.toBase58());
  console.log("Output amount:", outputAmount.toBase58());
  console.log();

  const sig = await program.methods
    .settleMatch(outputPrice, outputAmount)
    .accountsPartial({
      buyOrder,
      sellOrder,
      authority: payer.publicKey,
    })
    .signers([payer])
    .rpc();

  console.log("✓ Match settled. Both orders → Settled.");
  console.log("  TX :", explorerUrl(sig));
  console.log();
}

const [buy, sell] = process.argv.slice(2);
if (!buy || !sell) {
  console.error("Usage: bun run src/settle-match.ts <BUY_ORDER_PDA> <SELL_ORDER_PDA>");
  process.exit(1);
}

settleMatch(buy, sell).catch((err) => {
  console.error("\x1b[31m✗\x1b[0m", err);
  process.exit(1);
});
