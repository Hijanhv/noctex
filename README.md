# NOCTEX — Encrypted Dark Pool DEX

**Colosseum Frontier 2026 Hackathon** | Encrypt/Ika side track | LI.FI track

FHE-encrypted order matching dark pool on Solana devnet. Orders are submitted and matched entirely on ciphertexts using the Encrypt SDK — price and size remain hidden until settlement. Settlement is authorized by an Ika dWallet 2PC-MPC threshold signature, so no single key holder can authorize fund movement.

---

## Deployed Program

| Network | Program ID |
|---------|-----------|
| Solana devnet | `833YAgrbapXnLiYkUq6tG6hWfZ7whX34Xs7CtBN8Nrvx` |

---

## Architecture

```
User (Phantom wallet)
  │
  ├── submit_order()   → Order PDA (encrypted_price, encrypted_amount ciphertext pubkeys)
  │                       Encrypt gRPC executor creates CiphertextAccounts
  │
  ├── execute_match()  → Both orders → Matching state; Encrypt FHE match_orders graph
  │                       evaluates bid/ask comparison on ciphertexts
  │
  ├── settle_match()   → Output ciphertext pubkeys recorded; orders → Settled
  │
  └── sign_settlement() → Ika approve_message CPI; 2PC-MPC threshold signature produced
                          Settlement finalized with dWallet Ed25519 signature
```

### Tech Stack

| Component | Technology |
|-----------|-----------|
| FHE matching | Encrypt SDK (pre-alpha) + `#[encrypt_fn]` macro |
| Threshold signing | Ika dWallet 2PC-MPC, raw Anchor CPI |
| Cross-chain settlement | LI.FI SDK v3 |
| Smart contract | Anchor 0.32 on Solana devnet |
| Frontend | Next.js 14 App Router + Phantom wallet |

---

## Setup

### Prerequisites

```bash
# Solana CLI + Anchor
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
cargo install --git https://github.com/coral-xyz/anchor anchor-cli --locked

# Bun (TypeScript client runner)
curl -fsSL https://bun.sh/install | bash
```

### Environment

```bash
# Set devnet + your keypair
solana config set --url devnet
# Make sure ~/.config/solana/id.json exists with funded keypair
solana airdrop 2
```

### Build & Deploy

```bash
# Build the Anchor program
anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Verify program ID matches declare_id! in programs/noctex/src/lib.rs
solana program show 833YAgrbapXnLiYkUq6tG6hWfZ7whX34Xs7CtBN8Nrvx --url devnet
```

---

## TypeScript Client

```bash
cd client
bun install

# Submit a Buy order (price=100 USDC, amount=50 SOL)
bun run src/submit-order.ts Buy 100 50

# Submit a Sell order
bun run src/submit-order.ts Sell 98 50

# Match them (use pubkeys printed from submit commands)
bun run src/execute-match.ts <BUY_ORDER_PUBKEY> <SELL_ORDER_PUBKEY>

# Watch all program events live
bun run src/watch-events.ts
```

All orders encrypt price and amount via the **Encrypt gRPC executor** at `pre-alpha-dev-1.encrypt.ika-network.net:443` before submitting to the program.

---

## Frontend

```bash
cd app
npm install
npm run dev
# → http://localhost:3000
```

Connect Phantom wallet (devnet). The "CONNECT PHANTOM" button in the top-right uses the direct `window.phantom.solana` API — wallet adapter's Standard Wallet detection is broken by Phantom's SES lockdown in dev mode.

---

## LI.FI Integration

Cross-chain settlement routes are fetched via the LI.FI SDK. After a match settles, the `LifiSettlement` component displays the best bridge/swap route from any source chain to the settlement destination.

```typescript
// app/src/lib/lifi.ts
createConfig({ integrator: 'noctex' })
const route = await getSettlementQuote({ fromChain, toChain, fromToken, toToken, ... })
```

---

## Ika dWallet CPI

The program uses raw `invoke_signed` (not the ika-anchor crate) for maximum compatibility with pre-alpha Ika:

- CPI authority seed: `b"__ika_cpi_authority"`
- Ika program ID: `87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY`
- Instruction discriminator: `8` (approve_message)

---

## Encrypt FHE Graph

```rust
// programs/noctex/src/fhe.rs
#[encrypt_fn]
pub fn match_orders(bid_price, ask_price, bid_amount, ask_amount) -> (fill_buyer, fill_seller, exec_price) {
    let matched = bid_price.is_greater_or_equal(&ask_price);
    let min_amount = bid_amount.min(&ask_amount);
    let fill_buyer  = if matched { min_amount } else { EUint64::from(0u64) };
    let fill_seller = if matched { min_amount } else { EUint64::from(0u64) };
    let exec_price  = if matched { ask_price  } else { EUint64::from(0u64) };
    (fill_buyer, fill_seller, exec_price)
}
```

All comparison and selection ops run on encrypted values — the executor never sees plaintext prices or amounts.

---

## Program Instructions

| Instruction | Description |
|-------------|-------------|
| `submit_order` | Submit FHE-encrypted buy/sell order to the dark pool |
| `execute_match` | Initiate FHE matching between a buy/sell pair |
| `settle_match` | Record FHE output ciphertexts; mark orders Settled |
| `sign_settlement` | Ika dWallet CPI — produce 2PC-MPC threshold signature |
| `initialize_dwallet` | One-time setup: record dWallet ID + CPI authority |
| `cancel_order` | Cancel a Pending order (owner only) |

---

## Tracks

- **Encrypt/Ika**: `#[encrypt_fn]` FHE order matching + Ika 2PC-MPC settlement signing
- **LI.FI**: Cross-chain settlement routing via LI.FI SDK v3 (`integrator: 'noctex'`)
