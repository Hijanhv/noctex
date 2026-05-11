/**
 * Submit an order to the Noctex dark pool.
 *
 * Usage:
 *   bun run src/submit-order.ts <Buy|Sell> <price> <amount>
 *   bun run src/submit-order.ts Buy 100 50
 *
 * Flow:
 *   1. Encrypt `price` and `amount` as EUint64 ciphertexts via the Encrypt
 *      gRPC executor (`createInput`). The executor allocates two on-chain
 *      CiphertextAccounts and returns their pubkeys.
 *   2. Call `submit_order` on the Noctex program with those pubkeys; the
 *      Order PDA records them so `execute_match` can later run the FHE
 *      graph against the same ciphertext accounts.
 *
 * Pre-alpha note: the executor still treats ciphertext bytes as plaintext
 * in the mock 17-byte format. Don't submit secrets — this is for wiring,
 * not confidentiality, until the production network goes live.
 */

import { PublicKey, SystemProgram } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import {
  createEncryptClient,
  Chain,
} from "@encrypt.xyz/pre-alpha-solana-client/grpc";
import {
  getProgram,
  deriveOrderPda,
  explorerUrl,
  explorerAccountUrl,
  ENCRYPT_GRPC,
  PRE_ALPHA_NETWORK_KEY,
  FHE_TYPE_EUINT64,
  mockCiphertextBytes,
  NOCTEX_PROGRAM_ID,
} from "./config.ts";

type Side = "Buy" | "Sell";

async function submitOrder(side: Side, price: number, amount: number) {
  const { program, payer } = getProgram();

  const nonce = BigInt(Date.now());
  const [orderPda] = deriveOrderPda(payer.publicKey, nonce);

  console.log("\n══════════ Noctex: submit_order ══════════\n");
  console.log("Owner          :", payer.publicKey.toBase58());
  console.log("Side           :", side);
  console.log("Price (plain)  :", price);
  console.log("Amount (plain) :", amount);
  console.log("Order PDA      :", orderPda.toBase58());
  console.log("Nonce          :", nonce.toString());
  console.log();

  // 1) Create ciphertext accounts via Encrypt gRPC.
  //    `authorized` is the program that's allowed to use these ciphertexts as
  //    inputs to execute_graph. Pinning to NOCTEX_PROGRAM_ID prevents another
  //    program from CPI-ing match_orders with somebody else's encrypted price.
  console.log(`→ Calling Encrypt gRPC at ${ENCRYPT_GRPC} ...`);
  const encrypt = createEncryptClient(ENCRYPT_GRPC);
  try {
    const { ciphertextIdentifiers } = await encrypt.createInput({
      chain: Chain.Solana,
      inputs: [
        {
          ciphertextBytes: mockCiphertextBytes(BigInt(price), FHE_TYPE_EUINT64),
          fheType: FHE_TYPE_EUINT64,
        },
        {
          ciphertextBytes: mockCiphertextBytes(BigInt(amount), FHE_TYPE_EUINT64),
          fheType: FHE_TYPE_EUINT64,
        },
      ],
      authorized: Buffer.from(NOCTEX_PROGRAM_ID.toBytes()),
      networkEncryptionPublicKey: PRE_ALPHA_NETWORK_KEY,
    });
    const encryptedPrice = new PublicKey(ciphertextIdentifiers[0]);
    const encryptedAmount = new PublicKey(ciphertextIdentifiers[1]);

    console.log("  ✓ price  ct:", encryptedPrice.toBase58());
    console.log("  ✓ amount ct:", encryptedAmount.toBase58());
    console.log();

    // 2) Record the ciphertext pubkeys on the Order PDA.
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

    console.log("→ For execute-match.ts use:");
    console.log("  ", orderPda.toBase58());
    console.log();

    return {
      orderPda,
      sig,
      nonce,
      encryptedPrice,
      encryptedAmount,
    };
  } finally {
    encrypt.close();
  }
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
