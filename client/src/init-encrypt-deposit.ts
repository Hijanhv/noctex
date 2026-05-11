/**
 * One-time setup: create our payer's Encrypt `deposit` PDA.
 *
 * Every payer that issues `execute_graph` CPIs through Encrypt needs a
 * matching `encrypt_deposit` PDA. The Encrypt program uses it as the
 * pre-funded fee account so the FHE executor can charge for compute.
 *
 * Idempotent: if the deposit already exists, this script exits.
 *
 * Usage:
 *   bun run src/init-encrypt-deposit.ts
 *
 * Raw instruction shape (verified from the SDK coin-flip / voting demos):
 *   discriminator : 14
 *   layout        : 18-byte buffer = [14, bump, 16 zero bytes for reserved]
 *   accounts      : [deposit(W), config, payer(S), payer(S,W), payer(S,W),
 *                    vault(W), system_program, system_program]
 */

import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getConnection,
  loadKeypair,
  ENCRYPT_PROGRAM_ID,
  deriveEncryptConfigPda,
  deriveEncryptDepositPda,
  explorerUrl,
} from "./config.ts";

const IX_CREATE_DEPOSIT = 14;
const VAULT_OFFSET_IN_CONFIG = 100;

async function readEncryptVault(
  connection: Connection,
  configPda: PublicKey,
): Promise<PublicKey> {
  const info = await connection.getAccountInfo(configPda);
  if (!info) {
    throw new Error(
      `Encrypt config not initialized at ${configPda.toBase58()}. ` +
        "Is the devnet executor up?",
    );
  }
  return new PublicKey(
    (info.data as Buffer).subarray(VAULT_OFFSET_IN_CONFIG, VAULT_OFFSET_IN_CONFIG + 32),
  );
}

async function main() {
  const connection = getConnection();
  const payer = loadKeypair();
  const [configPda] = deriveEncryptConfigPda();
  const [depositPda, depositBump] = deriveEncryptDepositPda(payer.publicKey);

  console.log("\n══════════ Noctex: init_encrypt_deposit ══════════\n");
  console.log("Payer      :", payer.publicKey.toBase58());
  console.log("Config PDA :", configPda.toBase58());
  console.log("Deposit PDA:", depositPda.toBase58(), `(bump=${depositBump})`);

  const existing = await connection.getAccountInfo(depositPda);
  if (existing) {
    console.log("\n✓ Deposit already exists — nothing to do.\n");
    return;
  }

  const vault = await readEncryptVault(connection, configPda);
  const vaultPk = vault.equals(SystemProgram.programId) ? payer.publicKey : vault;
  console.log("Vault      :", vaultPk.toBase58());
  console.log();

  // 18-byte payload: [disc, bump, ...16 reserved-zero bytes]. Verified shape
  // from chains/solana/examples/coin-flip/react/server/house.ts.
  const data = Buffer.alloc(18);
  data[0] = IX_CREATE_DEPOSIT;
  data[1] = depositBump;

  const ix = new TransactionInstruction({
    programId: ENCRYPT_PROGRAM_ID,
    data,
    keys: [
      { pubkey: depositPda, isSigner: false, isWritable: true },
      { pubkey: configPda, isSigner: false, isWritable: false },
      { pubkey: payer.publicKey, isSigner: true, isWritable: false },
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      {
        pubkey: vaultPk,
        isSigner: vaultPk.equals(payer.publicKey),
        isWritable: true,
      },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
  });

  const sig = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(ix),
    [payer],
    { commitment: "confirmed" },
  );

  console.log("✓ Encrypt deposit created.");
  console.log("  TX:", explorerUrl(sig));
  console.log();
}

main().catch((err) => {
  console.error("\x1b[31m✗\x1b[0m", err);
  process.exit(1);
});
