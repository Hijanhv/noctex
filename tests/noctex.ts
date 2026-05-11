/**
 * Noctex on-chain tests.
 *
 * What's covered (runs on anchor's local validator):
 *   - submit_order writes the correct fields on the Order PDA
 *   - submit_order rejects a duplicate (owner, nonce) PDA
 *   - cancel_order succeeds while Pending; rejects non-owner; rejects re-cancel
 *   - execute_match constraint paths: Buy/Buy rejected, ciphertext mismatch rejected
 *
 * What's NOT covered (would need a live Encrypt + Ika executor on devnet):
 *   - the Encrypt CPI inside execute_match (FHE graph execution)
 *   - the Ika CPI inside sign_settlement / the signature verify in
 *     finalize_settlement
 * Those are exercised by the bun scripts in client/src against devnet.
 *
 * The constraint-path execute_match tests still validate the program's
 * access-control surface — the CiphertextMismatch / WrongOrderSide guards
 * fire BEFORE any CPI is built, so they're locally observable.
 */

import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";

import { Noctex } from "../target/types/noctex";

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
const program = anchor.workspace.noctex as Program<Noctex>;

const ORDER_SEED = Buffer.from("order");

function deriveOrderPda(owner: PublicKey, nonce: bigint): PublicKey {
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeBigUInt64LE(nonce);
  const [pda] = PublicKey.findProgramAddressSync(
    [ORDER_SEED, owner.toBuffer(), nonceBuf],
    program.programId,
  );
  return pda;
}

let nonceCounter = BigInt(Date.now());
function freshNonce(): bigint {
  nonceCounter += 1n;
  return nonceCounter;
}

/**
 * Submit an order from the provider's env wallet (which has SOL on devnet).
 * Tests avoid airdrops because devnet's faucet rate-limits them.
 */
async function submitOrder(
  side: "Buy" | "Sell",
  encryptedPrice = Keypair.generate().publicKey,
  encryptedAmount = Keypair.generate().publicKey,
  nonce = freshNonce(),
): Promise<{ orderPda: PublicKey; nonce: bigint; owner: PublicKey }> {
  const owner = provider.wallet.publicKey;
  const orderPda = deriveOrderPda(owner, nonce);
  await program.methods
    .submitOrder(
      new BN(nonce.toString()),
      side === "Buy" ? { buy: {} } : { sell: {} },
      encryptedPrice,
      encryptedAmount,
    )
    .accountsPartial({
      order: orderPda,
      owner,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  return { orderPda, nonce, owner };
}

describe("noctex", () => {
  let nonOwner: Keypair;

  before(() => {
    // Used as a non-owner signer in constraint tests. Never pays for tx,
    // so it doesn't need SOL — Anchor's provider wallet is the fee payer.
    nonOwner = Keypair.generate();
  });

  describe("submit_order", () => {
    it("writes the expected fields on the Order PDA", async () => {
      const encryptedPrice = Keypair.generate().publicKey;
      const encryptedAmount = Keypair.generate().publicKey;
      const { orderPda, nonce, owner } = await submitOrder(
        "Buy",
        encryptedPrice,
        encryptedAmount,
      );

      const order = await program.account.order.fetch(orderPda);
      expect(order.owner.toBase58()).to.equal(owner.toBase58());
      expect(order.encryptedPrice.toBase58()).to.equal(encryptedPrice.toBase58());
      expect(order.encryptedAmount.toBase58()).to.equal(
        encryptedAmount.toBase58(),
      );
      expect(order.side).to.deep.equal({ buy: {} });
      expect(order.status).to.deep.equal({ pending: {} });
      expect(order.matchedWith.toBase58()).to.equal(PublicKey.default.toBase58());
      expect(order.messageApproval.toBase58()).to.equal(
        PublicKey.default.toBase58(),
      );
      expect(order.nonce.toString()).to.equal(nonce.toString());
    });

    it("rejects a duplicate (owner, nonce) PDA", async () => {
      const nonce = freshNonce();
      await submitOrder("Buy", undefined, undefined, nonce);
      try {
        await submitOrder("Buy", undefined, undefined, nonce);
        expect.fail("duplicate submit should have thrown");
      } catch (err: any) {
        // System program's account-already-in-use error surfaces here.
        expect(String(err)).to.match(/already in use|custom program error/i);
      }
    });
  });

  describe("cancel_order", () => {
    it("transitions Pending → Cancelled when the owner calls it", async () => {
      const { orderPda, owner } = await submitOrder("Sell");
      await program.methods
        .cancelOrder()
        .accountsPartial({ order: orderPda, owner })
        .rpc();

      const after = await program.account.order.fetch(orderPda);
      expect(after.status).to.deep.equal({ cancelled: {} });
    });

    it("rejects cancellation by a non-owner", async () => {
      const { orderPda } = await submitOrder("Buy");
      try {
        await program.methods
          .cancelOrder()
          .accountsPartial({ order: orderPda, owner: nonOwner.publicKey })
          .signers([nonOwner])
          .rpc();
        expect.fail("non-owner cancel should have thrown");
      } catch (err: any) {
        expect(String(err)).to.match(/Unauthorized|ConstraintHasOne/);
      }
    });

    it("rejects re-cancellation (status must be Pending)", async () => {
      const { orderPda, owner } = await submitOrder("Buy");
      await program.methods
        .cancelOrder()
        .accountsPartial({ order: orderPda, owner })
        .rpc();

      try {
        await program.methods
          .cancelOrder()
          .accountsPartial({ order: orderPda, owner })
          .rpc();
        expect.fail("second cancel should have thrown");
      } catch (err: any) {
        expect(String(err)).to.match(/OrderNotCancellable/);
      }
    });
  });

  describe("execute_match constraints", () => {
    /**
     * Builds the account set for execute_match. The Encrypt CPI itself
     * never runs in these tests — they're constructed so that:
     *   - account-level constraints pass (real ENCRYPT_PROGRAM_ID, real
     *     caller_program, derived encrypt_cpi_authority PDA);
     *   - then the in-handler require!() short-circuits the function with
     *     the specific error we're testing.
     */
    const ENCRYPT_PROGRAM_ID = new PublicKey(
      "4ebfzWdKnrnGseuQpezXdG8yCdHqwQ1SSBHD3bWArND8",
    );
    const [encryptCpiAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("__encrypt_cpi_authority")],
      program.programId,
    );

    function stubEncryptAccounts() {
      return {
        encryptProgram: ENCRYPT_PROGRAM_ID,
        encryptConfig: Keypair.generate().publicKey,
        encryptDeposit: Keypair.generate().publicKey,
        encryptCpiAuthority,
        callerProgram: program.programId,
        networkEncryptionKey: Keypair.generate().publicKey,
        encryptEventAuthority: Keypair.generate().publicKey,
      };
    }

    it("rejects matching two Buy orders (WrongOrderSide)", async () => {
      const buyA = await submitOrder("Buy");
      const buyB = await submitOrder("Buy");
      const outA = Keypair.generate();
      const outB = Keypair.generate();
      const outC = Keypair.generate();

      try {
        await program.methods
          .executeMatch(255)
          .accountsPartial({
            buyOrder: buyA.orderPda,
            sellOrder: buyB.orderPda,
            buyPriceCt: Keypair.generate().publicKey,
            sellPriceCt: Keypair.generate().publicKey,
            buyAmountCt: Keypair.generate().publicKey,
            sellAmountCt: Keypair.generate().publicKey,
            fillBuyerCt: outA.publicKey,
            fillSellerCt: outB.publicKey,
            execPriceCt: outC.publicKey,
            payer: provider.wallet.publicKey,
            systemProgram: SystemProgram.programId,
            ...stubEncryptAccounts(),
          })
          .rpc();
        expect.fail("Buy/Buy execute_match should have thrown");
      } catch (err: any) {
        expect(String(err)).to.match(/WrongOrderSide/);
      }
    });

    it("rejects when the ciphertext keys do not match the Order PDA", async () => {
      const buy = await submitOrder("Buy");
      const sell = await submitOrder("Sell");
      const outA = Keypair.generate();
      const outB = Keypair.generate();
      const outC = Keypair.generate();

      // Pass random ciphertext pubkeys — not the ones recorded on either Order.
      try {
        await program.methods
          .executeMatch(255)
          .accountsPartial({
            buyOrder: buy.orderPda,
            sellOrder: sell.orderPda,
            buyPriceCt: Keypair.generate().publicKey,
            sellPriceCt: Keypair.generate().publicKey,
            buyAmountCt: Keypair.generate().publicKey,
            sellAmountCt: Keypair.generate().publicKey,
            fillBuyerCt: outA.publicKey,
            fillSellerCt: outB.publicKey,
            execPriceCt: outC.publicKey,
            payer: provider.wallet.publicKey,
            systemProgram: SystemProgram.programId,
            ...stubEncryptAccounts(),
          })
          .rpc();
        expect.fail("ciphertext mismatch execute_match should have thrown");
      } catch (err: any) {
        expect(String(err)).to.match(/CiphertextMismatch/);
      }
    });
  });
});
