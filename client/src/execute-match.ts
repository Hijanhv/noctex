/**
 * Initiate FHE matching between a buy order and a sell order.
 *
 * Usage:
 *   bun run src/execute-match.ts <BUY_ORDER_PDA> <SELL_ORDER_PDA>
 */

import { PublicKey, SystemProgram } from "@solana/web3.js";
import { getProgram, explorerUrl } from "./config.ts";

async function executeMatch(buyArg: string, sellArg: string) {
  const { program, payer } = getProgram();
  const buyOrder = new PublicKey(buyArg);
  const sellOrder = new PublicKey(sellArg);

  console.log("\n══════════ Noctex: execute_match ══════════\n");
  console.log("Buy  order :", buyOrder.toBase58());
  console.log("Sell order :", sellOrder.toBase58());
  console.log();

  const sig = await program.methods
    .executeMatch()
    .accountsPartial({
      buyOrder,
      sellOrder,
      payer: payer.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([payer])
    .rpc();

  console.log("✓ Match initiated. Both orders → Matching.");
  console.log("  TX :", explorerUrl(sig));
  console.log();
}

const [buy, sell] = process.argv.slice(2);
if (!buy || !sell) {
  console.error("Usage: bun run src/execute-match.ts <BUY_ORDER_PDA> <SELL_ORDER_PDA>");
  process.exit(1);
}

executeMatch(buy, sell).catch((err) => {
  console.error("\x1b[31m✗\x1b[0m", err);
  process.exit(1);
});
