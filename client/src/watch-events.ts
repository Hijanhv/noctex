/**
 * Subscribe to all Noctex program events on devnet.
 *
 * Usage:
 *   bun run src/watch-events.ts
 *
 * Keep this running in one terminal while you submit/match/settle in others.
 */

import { getProgram } from "./config.ts";

const COLOR = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  blue: "\x1b[34m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

function ts(): string {
  return new Date().toISOString().split("T")[1].replace("Z", "");
}

async function watch() {
  const { program } = getProgram();

  console.log("\n👁  Noctex event listener — devnet\n");

  program.addEventListener("orderSubmitted", (event) => {
    console.log(
      `${COLOR.dim}[${ts()}]${COLOR.reset} ${COLOR.blue}● ORDER SUBMITTED${COLOR.reset}`,
    );
    console.log(`  Order   : ${event.order}`);
    console.log(`  Owner   : ${event.owner}`);
    console.log(`  Side    : ${JSON.stringify(event.side)}`);
    console.log(`  Price ct: ${event.encryptedPrice}`);
    console.log(`  Amt ct  : ${event.encryptedAmount}`);
    console.log();
  });

  program.addEventListener("matchInitiated", (event) => {
    console.log(
      `${COLOR.dim}[${ts()}]${COLOR.reset} ${COLOR.yellow}⟳ MATCH INITIATED${COLOR.reset}`,
    );
    console.log(`  Buy  : ${event.buyOrder}`);
    console.log(`  Sell : ${event.sellOrder}`);
    console.log();
  });

  program.addEventListener("matchSettled", (event) => {
    console.log(
      `${COLOR.dim}[${ts()}]${COLOR.reset} ${COLOR.green}✓ MATCH SETTLED${COLOR.reset}`,
    );
    console.log(`  Buy           : ${event.buyOrder}`);
    console.log(`  Sell          : ${event.sellOrder}`);
    console.log(`  Output price  : ${event.outputPrice}`);
    console.log(`  Output amount : ${event.outputAmount}`);
    console.log();
  });

  program.addEventListener("orderCancelled", (event) => {
    console.log(
      `${COLOR.dim}[${ts()}]${COLOR.reset} ${COLOR.magenta}× ORDER CANCELLED${COLOR.reset}`,
    );
    console.log(`  Order : ${event.order}`);
    console.log();
  });

  program.addEventListener("dWalletInitialized", (event) => {
    console.log(
      `${COLOR.dim}[${ts()}]${COLOR.reset} ${COLOR.cyan}🔑 DWALLET INITIALIZED${COLOR.reset}`,
    );
    console.log(`  dWallet ID    : ${event.dwalletId}`);
    console.log(`  CPI authority : ${event.cpiAuthority}`);
    console.log();
  });

  program.addEventListener("settlementSigned", (event) => {
    console.log(
      `${COLOR.dim}[${ts()}]${COLOR.reset} ${COLOR.cyan}🔏 SETTLEMENT SIGNED via Ika${COLOR.reset}`,
    );
    console.log(`  Buy        : ${event.buyOrder}`);
    console.log(`  Sell       : ${event.sellOrder}`);
    console.log(`  Approval   : ${event.messageApproval}`);
    console.log(`  Msg digest : 0x${Buffer.from(event.messageDigest).toString("hex")}`);
    console.log();
  });

  console.log("Listening on devnet. Ctrl+C to stop.\n");
  await new Promise(() => {});
}

watch().catch((err) => {
  console.error("\x1b[31m✗\x1b[0m", err);
  process.exit(1);
});
