/**
 * Verify the Ika 2PC-MPC signature on a settlement and transition both
 * orders to Finalized.
 *
 * Usage:
 *   bun run src/finalize-settlement.ts <BUY_ORDER> <SELL_ORDER>
 *
 * Flow:
 *   1. Read the MessageApproval pubkey that `sign_settlement` recorded on
 *      the Order PDA.
 *   2. Poll that account until byte[139] (status) == 1 (Signed). The Ika
 *      pre-alpha mock signer typically commits within a few seconds.
 *   3. Call `finalize_settlement` — the program re-reads the account, gates
 *      on (owner=Ika, status=Signed, sig_len>0), and flips both orders to
 *      Finalized. Without a valid signature, the call reverts.
 *
 * In pre-alpha the signature bytes are all-zero by design (single mock
 * signer), so the *structural* gate is what's meaningful: no Signed
 * MessageApproval account → no Finalized state.
 */

import { PublicKey } from "@solana/web3.js";
import {
  getProgram,
  getConnection,
  explorerUrl,
  explorerAccountUrl,
} from "./config.ts";

const MA_STATUS_OFFSET = 172;
const MA_SIG_LEN_OFFSET = 173;
const MA_SIG_OFFSET = 175;
const POLL_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 1_000;

async function waitForSignature(
  messageApproval: PublicKey,
): Promise<{ sigLen: number; statusByte: number }> {
  const connection = getConnection();
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const info = await connection.getAccountInfo(messageApproval, "confirmed");
    if (info && info.data.length > MA_SIG_OFFSET) {
      const data = info.data as Buffer;
      const status = data[MA_STATUS_OFFSET];
      if (status === 1) {
        const sigLen = data.readUInt16LE(MA_SIG_LEN_OFFSET);
        if (sigLen > 0) {
          return { sigLen, statusByte: status };
        }
      }
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(
    `Timed out waiting for Ika network to sign ${messageApproval.toBase58()}`,
  );
}

async function finalizeSettlement(buyArg: string, sellArg: string) {
  const { program, payer } = getProgram();
  const buyOrder = new PublicKey(buyArg);
  const sellOrder = new PublicKey(sellArg);

  const buy = await program.account.order.fetch(buyOrder);
  const messageApproval = buy.messageApproval as PublicKey;
  if (messageApproval.equals(PublicKey.default)) {
    throw new Error(
      "buy_order.message_approval is unset — run sign-settlement.ts first.",
    );
  }

  console.log("\n══════════ Noctex: finalize_settlement ══════════\n");
  console.log("Buy  order        :", buyOrder.toBase58());
  console.log("Sell order        :", sellOrder.toBase58());
  console.log("MessageApproval   :", messageApproval.toBase58());
  console.log();
  console.log("→ Waiting for Ika network to sign...");

  const { sigLen } = await waitForSignature(messageApproval);
  console.log(`  ✓ status=Signed, sig_len=${sigLen} bytes`);
  console.log();

  const sig = await program.methods
    .finalizeSettlement()
    .accountsPartial({
      buyOrder,
      sellOrder,
      messageApproval,
      authority: payer.publicKey,
    })
    .signers([payer])
    .rpc();

  console.log("✓ Settlement finalized. Both orders → Finalized.");
  console.log("  TX             :", explorerUrl(sig));
  console.log("  MessageApproval:", explorerAccountUrl(messageApproval));
  console.log();
}

const [buy, sell] = process.argv.slice(2);
if (!buy || !sell) {
  console.error(
    "Usage: bun run src/finalize-settlement.ts <BUY_ORDER> <SELL_ORDER>",
  );
  process.exit(1);
}

finalizeSettlement(buy, sell).catch((err) => {
  console.error("\x1b[31m✗\x1b[0m", err);
  process.exit(1);
});
