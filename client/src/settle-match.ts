/**
 * Transition a matched pair from Matching → Settled.
 *
 * Usage:
 *   bun run src/settle-match.ts <BUY_ORDER_PDA> <SELL_ORDER_PDA>
 *
 * The output ciphertext pubkeys (fill_buyer, fill_seller, exec_price) are
 * already on each Order PDA — execute_match wrote them after the FHE CPI.
 * This call just flips the state machine so sign_settlement can run next.
 */

import { PublicKey } from "@solana/web3.js";
import { getProgram, explorerUrl, explorerAccountUrl } from "./config.ts";

async function settleMatch(buyArg: string, sellArg: string) {
  const { program, payer } = getProgram();
  const buyOrder = new PublicKey(buyArg);
  const sellOrder = new PublicKey(sellArg);

  const buy = await program.account.order.fetch(buyOrder);

  console.log("\n══════════ Noctex: settle_match ══════════\n");
  console.log("Buy  order        :", buyOrder.toBase58());
  console.log("Sell order        :", sellOrder.toBase58());
  console.log("Settling on exec  :", buy.outputPrice.toBase58());
  console.log("Buyer  fill ct    :", buy.outputAmount.toBase58());
  console.log();

  const sig = await program.methods
    .settleMatch()
    .accountsPartial({
      buyOrder,
      sellOrder,
      authority: payer.publicKey,
    })
    .signers([payer])
    .rpc();

  console.log("✓ Match settled. Both orders → Settled.");
  console.log("  TX        :", explorerUrl(sig));
  console.log("  exec_price:", explorerAccountUrl(buy.outputPrice));
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
