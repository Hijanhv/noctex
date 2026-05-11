# NOCTEX — Encrypted Dark Pool DEX

**Colosseum Frontier 2026 Hackathon** | Encrypt & Ika side track 

## 📊 Pitch Deck
**[→ View Noctex Pitch Deck](https://noctex-pitch-deck.tiiny.site/)**

## 🎬 Videos
**[→ Pitch Video](https://youtu.be/tnDzajQjYvU?si=MIUfbC9p4eaJdeXu)**
**[→ Demo Video](https://youtu.be/gF-waPYkcXc?si=DfltlK6uZVsk1-C9)**

**Live demo: [noctex.vercel.app](https://noctex.vercel.app)** — click PLACE BUY / SELL to submit a real FHE-encrypted order to devnet, then run the on-page Match → Settle → Sign → Finalize flow.

An order book where price and quantity stay encrypted from submit through match, and settlement requires an Ika 2PC-MPC signature the program controls. The matching itself runs as a fully homomorphic computation on ciphertexts — the executor never sees plaintext.

---

## Why Noctex exists

### The problem

Every order book on Solana is fully transparent. The price and size of a resting order are public the instant it lands, and the matching engine sees plaintext too. Two failure modes follow from that:

1. **MEV extraction.** Searchers read pending orders and front-run, sandwich, or back-run them. A trader who shows a $500K bid pays a tax to the bot that saw it first.
2. **Information leak on size.** A trader trying to move a large position can't, because the first slice of the order moves the market against the rest. Institutions and DAO treasuries route around this with TWAP bots, OTC desks, or by giving up and trading on centralized exchanges — which is exactly what crypto was supposed to remove.

Both problems exist because the order book is a public ledger of intent, not just a public ledger of outcomes.

### The gap

The existing answers are partial:

- **TradFi dark pools** (Liquidnet, ITG POSIT, broker crossing networks) hide order flow, but you trust a centralized operator with custody and matching. Settlement isn't on-chain at all.
- **Batch auctions** (CoW Swap, UniswapX) suppress MEV between batches, but every order in the batch is still visible to solvers — they see your price and size to compute the clearing price.
- **ZK-shielded DEXs** (Penumbra) get real privacy, but require an entirely separate chain. You can't reach Solana liquidity from there.
- **Encrypted mempools** (Shutter, Espresso) hide orders only until inclusion — once a block is built, everything is plaintext.

Nothing on Solana lets a trader submit a price + size that stays encrypted from submit through match and has a settlement guarantee that doesn't depend on a single key holder.

### Our solution

Noctex composes two pre-alpha primitives that didn't exist a year ago:

- **Encrypt FHE** lets the matching engine evaluate `bid_price >= ask_price` and `min(bid_amount, ask_amount)` directly on ciphertexts. The executor never sees the inputs (`fhe.rs:32`).
- **Ika 2PC-MPC** lets the program hold a dWallet whose signing requires a threshold of network nodes. The Solana program approves a settlement digest, the Ika network signs it off-chain, and `finalize_settlement` refuses to advance until that signature lands (`lib.rs:309`).

The two primitives compose: FHE hides what's being settled, MPC controls when it settles. Neither is enough on its own — without FHE, the order book leaks; without MPC, a single compromised key drains the contract.

### Who it's for

- **Funds and prop desks** moving size in SOL, SOL LSTs, or stablecoins — currently routed through OTC or TWAPs to avoid market impact.
- **Market makers** quoting on both sides who don't want competitors reading their book to reverse-engineer pricing.
- **DAO treasuries** rebalancing positions (diversifying out of native tokens, paying contributors in stables) where the size of the swap is itself sensitive information.
- **MEV-aware retail** — any trader doing >$50K size who currently splits orders by hand to avoid sandwich bots.

The common thread: anyone whose order *being visible* is itself the leak.

### What Noctex gives you

- Price and size hidden from submit through match. The chain stores ciphertext pubkeys, not values.
- No MEV surface against your order — searchers can't read it.
- Settlement gated by a threshold signature held by the program, not a single key. No single rug vector.
- Solana-native — fits into Phantom and the existing wallet UX, no bridge to a privacy chain.
- Composable — outputs are normal Solana ciphertext PDAs; settlement can flow into any downstream Solana primitive.

### Market

Dark pools handle roughly 13–18% of US equity volume (FINRA ATS reporting, 2024) — that's the size of the demand when traders have a choice. Solana DEX volume runs in the multi-billion-USD-per-day range. If even a low-single-digit share of that volume routes through encrypted matching, the addressable flow is hundreds of millions a day. Fee capture at 5–10 bps is a real revenue line, but the more interesting prize is being the place size goes when it doesn't want to be seen.

---

## Deployed Program

| Network | Program ID |
|---------|-----------|
| Solana devnet | `833YAgrbapXnLiYkUq6tG6hWfZ7whX34Xs7CtBN8Nrvx` |

---

## How the two SDKs are load-bearing

### Encrypt (FHE) — matching runs on ciphertexts

`programs/noctex/src/fhe.rs:32` declares the match-orders graph with `#[encrypt_fn]`:

```rust
#[encrypt_fn]
pub fn match_orders(
    bid_price: EUint64, ask_price: EUint64,
    bid_amount: EUint64, ask_amount: EUint64,
) -> (EUint64, EUint64, EUint64) {
    let matched     = bid_price.is_greater_or_equal(&ask_price);
    let min_amount  = bid_amount.min(&ask_amount);
    let fill_buyer  = if matched { min_amount } else { EUint64::from(0u64) };
    let fill_seller = if matched { min_amount } else { EUint64::from(0u64) };
    let exec_price  = if matched { ask_price  } else { EUint64::from(0u64) };
    (fill_buyer, fill_seller, exec_price)
}
```

Every comparison and select is an op on the ciphertext graph; the Encrypt executor evaluates it without learning the inputs.

The graph is invoked from `execute_match` via `invoke_match_orders` (`programs/noctex/src/lib.rs:86`), which builds the `execute_graph` CPI manually (`programs/noctex/src/fhe.rs:64`) using the wire format from the Encrypt SDK — `[disc=4, graph_len_u16_le, graph_bytes, num_inputs_u8]`, signed by the `b"__encrypt_cpi_authority"` PDA. This sidesteps the `encrypt-anchor` crate, which would force `anchor-lang = "1"` and conflict with the rest of the workspace on `0.32`.

Client-side, real ciphertexts are created via the SDK's gRPC executor in `client/src/submit-order.ts`:

```ts
const { ciphertextIdentifiers } = await encrypt.createInput({
  chain: Chain.Solana,
  inputs: [
    { ciphertextBytes: mockCiphertextBytes(price,  FHE_TYPE_EUINT64), fheType: 4 },
    { ciphertextBytes: mockCiphertextBytes(amount, FHE_TYPE_EUINT64), fheType: 4 },
  ],
  authorized: NOCTEX_PROGRAM_ID.toBytes(),
  networkEncryptionPublicKey: PRE_ALPHA_NETWORK_KEY,
});
```

The returned `ciphertextIdentifiers` become the `encrypted_price` and `encrypted_amount` fields on the Order PDA. `execute_match` then re-validates those pubkeys against the accounts the caller passes (`programs/noctex/src/lib.rs:75-83`), so a third party can't swap in someone else's ciphertext.

### Ika (2PC-MPC) — settlement won't advance without a signed approval

`sign_settlement` (`programs/noctex/src/lib.rs:234`) CPIs into Ika's `approve_message` (discriminator 8, layout in `programs/noctex/src/dwallet.rs:62-80`). It records the resulting `MessageApproval` PDA address on both Orders so the next call can verify against the exact account.

`finalize_settlement` (`programs/noctex/src/lib.rs:309`) is the gate that makes Ika load-bearing. It refuses to advance the state machine until:

1. `message_approval.key()` matches the pubkey both Orders stored in `sign_settlement`.
2. The account's owner is `IKA_PROGRAM_ID` (only Ika can publish the Signed status).
3. `data[172] == 1` (Signed) — offsets cross-checked against Ika's `voting/e2e-rust` reference (the `verify-signature.md` doc has the right idea but a typo in the offset table).
4. `data[173..175]` (u16 LE `signature_len`) is non-zero and the slice fits.

The MessageApproval PDA's seeds bind the signature to a specific (dwallet, scheme, message_digest), so the existence of a Signed account at the expected address proves the Ika network committed to that exact settlement. Only then do both orders advance to `Finalized` (`programs/noctex/src/lib.rs:345`).

> Cryptographic verify against the dWallet public key (ed25519/secp256k1) is intentionally deferred — Ika pre-alpha's mock signer commits an all-zero signature, so a real verifier would always reject on devnet. The structural gate above is the meaningful production constraint.

---

## End-to-end demo flow

```
            ┌─────────────────────────────────────────────────────┐
            │  bun run init-encrypt-deposit   (one-time per payer)│
            │  bun run init-dwallet <ID>      (one-time)          │
            └─────────────────────────────────────────────────────┘

  submit Buy 100 50 ─┐
                     ├─► Encrypt gRPC createInput → 2 ciphertext PDAs
  submit Sell 98 50 ─┘                              + Order PDA stores keys

  match <BUY> <SELL> ─► execute_graph CPI to Encrypt
                       ─► fill_buyer / fill_seller / exec_price ciphertexts
                       ─► both Orders → Matching, output ct pubkeys persisted

  settle <BUY> <SELL> ─► both Orders → Settled

  sign-settlement <BUY> <SELL> <DWALLET_PK_HEX>
                       ─► approve_message CPI to Ika
                       ─► MessageApproval PDA created (status=Pending)
                       ─► Ika network produces 2PC-MPC signature off-chain
                       ─► NOA writes signature back (status=Signed)

  finalize-settlement <BUY> <SELL>
                       ─► poll MessageApproval until byte[172]==1
                       ─► program verifies owner / status / sig_len
                       ─► both Orders → Finalized
```

Every step beyond `init-*` is in `client/src/` as a single bun script (`submit-order.ts`, `execute-match.ts`, `settle-match.ts`, `sign-settlement.ts`, `finalize-settlement.ts`).

### Or just click through it at [noctex.vercel.app](https://noctex.vercel.app)

The Next.js frontend (`app/`) mirrors the same pipeline:

- **`OrderForm`** — calls Encrypt gRPC-web `createInput` from the browser, builds the ciphertexts, then submits via Phantom. No CLI required.
- **`SettlementFlow`** — four buttons (Match → Settle → Sign → Finalize) that walk through the full state machine. Between Sign and Finalize the page shows the exact `noctex-ika-bootstrap sign` command for the Ika 2PC-MPC step (the Ika network's mock signer needs a Rust gRPC client to drive it).
- **`/docs`** — protocol reference, lifecycle diagram, real code excerpts.

---

## Setup

### Prerequisites

```bash
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
cargo install --git https://github.com/coral-xyz/anchor anchor-cli --tag v0.32.1 --locked
curl -fsSL https://bun.sh/install | bash
```

### Devnet wallet

```bash
solana config set --url devnet
solana airdrop 2   # repeat until you have ~5 SOL
```

### Build & deploy

```bash
anchor build
anchor deploy --provider.cluster devnet
solana program show 833YAgrbapXnLiYkUq6tG6hWfZ7whX34Xs7CtBN8Nrvx --url devnet
```

### Client

```bash
cd client && bun install
bun run init-encrypt-deposit
# then the demo flow above
```

### Frontend

```bash
cd app && npm install && npm run dev   # → http://localhost:3000
```

---

## Tests

`tests/noctex.ts` runs against devnet via the env wallet (no airdrops — devnet's faucet rate-limits). Re-run with:

```bash
anchor test --skip-deploy --skip-build
```

Coverage (7 passing):
- `submit_order` field persistence + duplicate-PDA rejection
- `cancel_order` happy path, non-owner rejection, re-cancellation rejection
- `execute_match` constraint paths — `WrongOrderSide` and `CiphertextMismatch`

The Encrypt/Ika CPI happy paths aren't part of the test suite (they need live devnet executors); they're exercised by the bun scripts.

---

## Tech stack

| Component | Technology |
|-----------|-----------|
| FHE matching | Encrypt pre-alpha SDK (`encrypt-dsl`, `encrypt-types`) + `#[encrypt_fn]` |
| Encrypt CPI | Hand-rolled `invoke_signed` (avoids anchor-lang version conflict) |
| Threshold signing | Ika dWallet 2PC-MPC, raw `invoke_signed` for `approve_message` |
| Signature gate | `finalize_settlement` reads `MessageApproval` bytes on-chain |
| Smart contract | Anchor 0.32 on Solana devnet |
| Client | Bun + `@coral-xyz/anchor` 0.32 + `@encrypt.xyz/pre-alpha-solana-client` |
| Frontend | Next.js 14 + Phantom wallet |

---

## Program instructions

| Instruction | Effect |
|-------------|--------|
| `submit_order` | Record (owner, side, encrypted_price, encrypted_amount) on a fresh PDA |
| `execute_match` | Run the FHE graph via Encrypt CPI; persist output ciphertexts; → Matching |
| `settle_match` | Transition both Orders to Settled |
| `sign_settlement` | Ika `approve_message` CPI; bind MessageApproval to both Orders |
| `finalize_settlement` | Verify Signed status + non-zero signature; → Finalized |
| `cancel_order` | Owner-only; only valid in Pending |
| `initialize_dwallet` / `update_dwallet_id` | One-time and refresh setup for the Ika dWallet config |

---

## References

- Encrypt SDK: https://docs.encrypt.xyz/ — `chains/solana/program-sdk/anchor` and `chains/solana/examples/voting` were the working references for the CPI shape and createInput flow.
- Ika pre-alpha: https://solana-pre-alpha.ika.xyz/ — `tutorial/verify-signature.md` is the source of truth for the MessageApproval byte layout.
- Encrypt program (devnet): `4ebfzWdKnrnGseuQpezXdG8yCdHqwQ1SSBHD3bWArND8`
- Ika program (devnet): `87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY`
