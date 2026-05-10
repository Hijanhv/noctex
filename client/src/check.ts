import {
  getProgram,
  getConnection,
  NOCTEX_PROGRAM_ID,
  ENCRYPT_PROGRAM_ID,
  IKA_PROGRAM_ID,
  explorerAccountUrl,
} from "./config.ts";

async function main() {
  const { payer, program } = getProgram();
  const conn = getConnection();
  const balance = await conn.getBalance(payer.publicKey);

  console.log("\n══════════════ Noctex client smoke test ══════════════\n");
  console.log("Wallet      :", payer.publicKey.toBase58());
  console.log("Balance     :", (balance / 1e9).toFixed(4), "SOL");
  console.log("RPC         : devnet (confirmed)");
  console.log();
  console.log("Noctex      :", NOCTEX_PROGRAM_ID.toBase58());
  console.log("            :", explorerAccountUrl(NOCTEX_PROGRAM_ID));
  console.log("Encrypt     :", ENCRYPT_PROGRAM_ID.toBase58());
  console.log("Ika         :", IKA_PROGRAM_ID.toBase58());
  console.log();

  const programInfo = await conn.getAccountInfo(NOCTEX_PROGRAM_ID);
  if (!programInfo) {
    console.error("✗ Noctex program account NOT found on devnet");
    process.exit(1);
  }
  console.log(
    "✓ Noctex program is live (",
    programInfo.data.length,
    "bytes,",
    programInfo.executable ? "executable" : "NOT executable",
    ")",
  );

  const ixNames = program.idl.instructions.map((i) => i.name);
  console.log("✓ IDL loaded —", ixNames.length, "instructions:", ixNames.join(", "));
  console.log();
}

main().catch((err) => {
  console.error("\x1b[31m✗\x1b[0m", err);
  process.exit(1);
});
