/**
 * Submit an order to the Noctex dark pool.
 *
 * Usage:
 *   bun run src/submit-order.ts <Buy|Sell> <price> <amount>
 *   bun run src/submit-order.ts Buy 100 50
 *
 * Pre-alpha note:
 *   The encrypted_price / encrypted_amount fields take pubkeys of CiphertextAccounts
 *   created by the Encrypt FHE executor. In a full pipeline the client first calls
 *   the Encrypt gRPC `createInput` for each value, gets back a ciphertext pubkey, and
 *   passes that here. For now we use freshly generated keypairs as placeholders so we
 *   can exercise the on-chain order-management flow end-to-end. Real encryption is
 *   wired into the React frontend in Step 12 (where users actually need it).
 */

import { Keypair, SystemProgram } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import {
  getProgram,
  deriveOrderPda,
  explorerUrl,
  explorerAccountUrl,
} from "./config.ts";

type Side = "Buy" | "Sell";

async function submitOrder(side: Side, price: number, amount: number) {
  const { program, payer } = getProgram();

  // Nonce makes the Order PDA unique per (owner, nonce). We use a fresh u64
  // each call so multiple orders from the same wallet don't collide.
  const nonce = BigInt(Date.now());
  const [orderPda] = deriveOrderPda(payer.publicKey, nonce);

  // Placeholder ciphertext pubkeys (see file header).
  const encryptedPrice = Keypair.generate().publicKey;
  const encryptedAmount = Keypair.generate().publicKey;

  console.log("\n══════════ Noctex: submit_order ══════════\n");
  console.log("Owner          :", payer.publicKey.toBase58());
  console.log("Side           :", side);
  console.log("Price (plain)  :", price, "  →  ct:", encryptedPrice.toBase58());
  console.log("Amount (plain) :", amount, "  →  ct:", encryptedAmount.toBase58());
  console.log("Order PDA      :", orderPda.toBase58());
  console.log("Nonce          :", nonce.toString());
  console.log();

  const sideArg = side === "Buy" ? { buy: {} } : { sell: {} };

  const sig = await program.methods
    .submitOrder(
      new BN(nonce.toString()),
      sideArg,
      encryptedPrice,
      encryptedAmount,
    )
    .accountsPartial({
      order: orderPda,
      owner: payer.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([payer])
    .rpc();

  console.log("✓ Order submitted");
  console.log("  TX     :", explorerUrl(sig));
  console.log("  Order  :", explorerAccountUrl(orderPda));
  console.log();

  // Print the line you'd paste into execute-match.ts:
  console.log("→ For execute-match.ts use:");
  console.log("  ", orderPda.toBase58());
  console.log();

  return { orderPda, sig, nonce };
}

const [sideArg, priceArg, amountArg] = process.argv.slice(2);
const side: Side = (sideArg as Side) ?? "Buy";
const price = parseInt(priceArg ?? "100", 10);
const amount = parseInt(amountArg ?? "50", 10);

if (side !== "Buy" && side !== "Sell") {
  console.error("Side must be 'Buy' or 'Sell'");
  process.exit(1);
}

submitOrder(side, price, amount).catch((err) => {
  console.error("\x1b[31m✗\x1b[0m", err);
  process.exit(1);
});
