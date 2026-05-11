/**
 * Run the FHE match graph for a buy/sell pair.
 *
 * Usage:
 *   bun run src/execute-match.ts <BUY_ORDER_PDA> <SELL_ORDER_PDA>
 *
 * Flow:
 *   1. Read both Order PDAs to recover their encrypted_price / encrypted_amount
 *      ciphertext pubkeys (set at submit_order time).
 *   2. Generate 3 fresh keypairs for the FHE outputs (fill_buyer, fill_seller,
 *      exec_price). The Encrypt program will allocate these accounts as part
 *      of the CPI; they must sign the outer transaction.
 *   3. Derive every Encrypt-side PDA (config, deposit, network_key,
 *      event_authority, encrypt_cpi_authority).
 *   4. Call execute_match — the program CPIs into Encrypt's execute_graph
 *      with the serialized match_orders graph, then persists the 3 output
 *      ciphertext pubkeys on the Order PDAs.
 */

import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  createEncryptClient,
  Chain,
} from "@encrypt.xyz/pre-alpha-solana-client/grpc";
import {
  getProgram,
  explorerUrl,
  explorerAccountUrl,
  ENCRYPT_PROGRAM_ID,
  ENCRYPT_GRPC,
  PRE_ALPHA_NETWORK_KEY,
  FHE_TYPE_EUINT64,
  NOCTEX_PROGRAM_ID,
  mockCiphertextBytes,
  deriveEncryptConfigPda,
  deriveEncryptEventAuthorityPda,
  deriveEncryptDepositPda,
  deriveEncryptNetworkKeyPda,
  deriveEncryptCpiAuthorityPda,
} from "./config.ts";

async function executeMatch(buyArg: string, sellArg: string) {
  const { program, payer } = getProgram();
  const buyOrder = new PublicKey(buyArg);
  const sellOrder = new PublicKey(sellArg);

  // 1) Recover ciphertext pubkeys recorded on each Order PDA.
  const [buy, sell] = await Promise.all([
    program.account.order.fetch(buyOrder),
    program.account.order.fetch(sellOrder),
  ]);

  // 2) Pre-allocate output ciphertext accounts. Encrypt's execute_graph CPI
  //    passes remaining accounts as non-signer, so it cannot create new
  //    accounts — we have to allocate three zero-valued EUint64 ciphertexts
  //    via gRPC first; execute_graph then overwrites them in place.
  console.log(`→ Pre-allocating 3 output ciphertexts via Encrypt gRPC ...`);
  const encrypt = createEncryptClient(ENCRYPT_GRPC);
  let fillBuyerCt: PublicKey;
  let fillSellerCt: PublicKey;
  let execPriceCt: PublicKey;
  try {
    const zero = mockCiphertextBytes(0n, FHE_TYPE_EUINT64);
    const { ciphertextIdentifiers } = await encrypt.createInput({
      chain: Chain.Solana,
      inputs: [
        { ciphertextBytes: zero, fheType: FHE_TYPE_EUINT64 },
        { ciphertextBytes: zero, fheType: FHE_TYPE_EUINT64 },
        { ciphertextBytes: zero, fheType: FHE_TYPE_EUINT64 },
      ],
      authorized: Buffer.from(NOCTEX_PROGRAM_ID.toBytes()),
      networkEncryptionPublicKey: PRE_ALPHA_NETWORK_KEY,
    });
    fillBuyerCt  = new PublicKey(ciphertextIdentifiers[0]);
    fillSellerCt = new PublicKey(ciphertextIdentifiers[1]);
    execPriceCt  = new PublicKey(ciphertextIdentifiers[2]);
  } finally {
    encrypt.close();
  }

  // 3) Derive Encrypt PDAs.
  const [encryptConfig] = deriveEncryptConfigPda();
  const [encryptEventAuthority] = deriveEncryptEventAuthorityPda();
  const [encryptDeposit] = deriveEncryptDepositPda(payer.publicKey);
  const [encryptNetworkKey] = deriveEncryptNetworkKeyPda();
  const [encryptCpiAuthority, cpiBump] = deriveEncryptCpiAuthorityPda();

  console.log("\n══════════ Noctex: execute_match ══════════\n");
  console.log("Buy  order        :", buyOrder.toBase58());
  console.log("Sell order        :", sellOrder.toBase58());
  console.log("Buy  price ct     :", buy.encryptedPrice.toBase58());
  console.log("Buy  amount ct    :", buy.encryptedAmount.toBase58());
  console.log("Sell price ct     :", sell.encryptedPrice.toBase58());
  console.log("Sell amount ct    :", sell.encryptedAmount.toBase58());
  console.log();
  console.log("Output fill_buyer :", fillBuyerCt.toBase58());
  console.log("Output fill_seller:", fillSellerCt.toBase58());
  console.log("Output exec_price :", execPriceCt.toBase58());
  console.log();
  console.log("Encrypt config    :", encryptConfig.toBase58());
  console.log("Encrypt deposit   :", encryptDeposit.toBase58());
  console.log("Encrypt CPI auth  :", encryptCpiAuthority.toBase58(),
    `(bump=${cpiBump})`);
  console.log();

  const sig = await program.methods
    .executeMatch(cpiBump)
    .accountsPartial({
      buyOrder,
      sellOrder,
      buyPriceCt: buy.encryptedPrice,
      sellPriceCt: sell.encryptedPrice,
      buyAmountCt: buy.encryptedAmount,
      sellAmountCt: sell.encryptedAmount,
      fillBuyerCt,
      fillSellerCt,
      execPriceCt,
      encryptProgram: ENCRYPT_PROGRAM_ID,
      encryptConfig,
      encryptDeposit,
      encryptCpiAuthority,
      callerProgram: program.programId,
      networkEncryptionKey: encryptNetworkKey,
      encryptEventAuthority,
      payer: payer.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([payer])
    .rpc();

  console.log("✓ Match graph executed via Encrypt CPI.");
  console.log("  TX           :", explorerUrl(sig));
  console.log("  fill_buyer   :", explorerAccountUrl(fillBuyerCt));
  console.log("  fill_seller  :", explorerAccountUrl(fillSellerCt));
  console.log("  exec_price   :", explorerAccountUrl(execPriceCt));
  console.log();
  console.log("→ Both orders are now Matching. Run settle-match next.");
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
