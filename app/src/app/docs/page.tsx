"use client";

const PROGRAM_ID = "833YAgrbapXnLiYkUq6tG6hWfZ7whX34Xs7CtBN8Nrvx";

const PROTOCOLS = [
  {
    num: "01",
    name: "ENCRYPT FHE SDK",
    tagline: "Homomorphic order matching",
    color: "var(--accent)",
    role: "Price and size are encrypted client-side via gRPC createInput before they ever touch Solana. The Noctex program then CPIs into Encrypt's execute_graph with the match_orders graph — bid ≥ ask, min(amounts), conditional fills — all evaluated on ciphertexts. The executor never sees plaintext; only ciphertext pubkeys land on the Order PDA.",
    how: [
      { label: "Instructions", value: "submit_order, execute_match, settle_match" },
      { label: "DSL macro",    value: "#[encrypt_fn] match_orders(bid, ask) → (fill_b, fill_s, exec)" },
      { label: "Key types",    value: "EUint64 ciphertexts (fhe_type=4)" },
      { label: "CPI seed",     value: 'b"__encrypt_cpi_authority"' },
      { label: "CPI shape",    value: "[disc=4, graph_len_u16, graph, num_inputs_u8] + 8 metas + 4 in + 3 out" },
      { label: "Program",      value: "4ebfzWdK…wArND8 (devnet)" },
    ],
    links: [{ label: "docs.encrypt.xyz", href: "https://docs.encrypt.xyz" }],
  },
  {
    num: "02",
    name: "IKA dWALLET — 2PC-MPC",
    tagline: "Distributed settlement signing",
    color: "#60a5fa",
    role: "Settlement only advances if the Ika network produces a distributed signature over the settlement digest. sign_settlement CPIs into Ika to create a MessageApproval PDA; the network signs off-chain and commits the signature back. finalize_settlement reads the MessageApproval bytes on-chain and refuses to flip to Finalized unless owner=Ika, status=Signed, sig_len > 0.",
    how: [
      { label: "DKG",          value: "gRPC DKG via ika-pre-alpha — dWallet PDA + Ed25519 pubkey" },
      { label: "Sign CPI",     value: "sign_settlement → approve_message (disc 8, 100 bytes)" },
      { label: "Verify gate",  value: "finalize_settlement reads bytes 172 (status) / 173-174 (sig_len) / 175+ (signature)" },
      { label: "Hash scheme",  value: "keccak256(\"noctex-settlement-v0|<buy>|<sell>\")" },
      { label: "dWallet",      value: "3om31VWzJx6oPt37qYcUSZFosfFGZgeegX7VjQBi7aRG (Curve25519)" },
      { label: "Live signature", value: "b92d6c9c…4b69f07 (64-byte EddsaSha512 on-chain)" },
    ],
    links: [{ label: "solana-pre-alpha.ika.xyz", href: "https://solana-pre-alpha.ika.xyz" }],
  },
  {
    num: "03",
    name: "LI.FI SDK",
    tagline: "Cross-chain delivery",
    color: "#a78bfa",
    role: "Once a settlement is Finalized, LI.FI provides the route to deliver value cross-chain. A single Ika signature on Solana unlocks bridging to any supported EVM chain — settlement integrity stays on Noctex; LI.FI just moves the asset.",
    how: [
      { label: "SDK",          value: "@lifi/sdk — getQuote, executeRoute" },
      { label: "Widget",       value: "@lifi/widget — embedded settlement-route UI" },
      { label: "Flow",         value: "finalize_settlement → LI.FI route → cross-chain transfer" },
      { label: "Chains",       value: "Solana → Ethereum / Arbitrum / Base / Optimism" },
      { label: "Integration",  value: "LifiSettlement panel on the trade page" },
    ],
    links: [{ label: "li.fi/sdk", href: "https://li.fi" }],
  },
];

const CODE_SNIPPETS = [
  {
    title: "FHE match_orders graph (programs/noctex/src/fhe.rs)",
    lang: "rust",
    code: `#[encrypt_fn]
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
}`,
  },
  {
    title: "Encrypt execute_graph CPI (programs/noctex/src/fhe.rs)",
    lang: "rust",
    code: `// We build the CPI inline to keep Noctex on anchor-lang 0.32.
// Wire format (verified against the Encrypt SDK):
//   ix_data  = [4, graph_len_u16_le, graph_bytes, num_inputs_u8]
//   accounts = [config(W), deposit(W), caller_program, cpi_authority(S),
//               network_encryption_key, payer(W,S), event_authority,
//               encrypt_program, ...4_inputs(W), ...3_outputs(W)]
let seeds: &[&[u8]] = &[ENCRYPT_CPI_AUTHORITY_SEED, &[cpi_authority_bump]];
invoke_signed(&ix, &infos, &[seeds])?;`,
  },
  {
    title: "Ika signature gate (programs/noctex/src/lib.rs:309)",
    lang: "rust",
    code: `pub fn finalize_settlement(ctx: Context<FinalizeSettlement>) -> Result<()> {
    let ma = &ctx.accounts.message_approval;

    require!(buy.message_approval == ma.key()
          && sell.message_approval == ma.key(), MessageApprovalMismatch);
    require!(ma.owner == &IKA_PROGRAM_ID, MessageApprovalNotIkaOwned);

    let data = ma.try_borrow_data()?;
    require!(data.len() >= 175, MessageApprovalMalformed);
    require!(data[172] == 1, SettlementNotSigned);          // status = Signed
    let sig_len = u16::from_le_bytes(data[173..175].try_into().unwrap());
    require!(sig_len > 0, SettlementSignatureMissing);

    buy.status = OrderStatus::Finalized;
    sell.status = OrderStatus::Finalized;
    Ok(())
}`,
  },
  {
    title: "Frontend submit_order (app/src/components/OrderForm.tsx)",
    lang: "typescript",
    code: `// Encrypt price + amount via gRPC-web, then submit via Phantom.
const { program, publicKey } = await getProgramWithPhantom();
const encrypt = createEncryptWebClient(ENCRYPT_GRPC_WEB);

const ids = await encrypt.createInput({
  chain: Chain.SOLANA,
  inputs: [
    { ciphertextBytes: mockCiphertextBytes(BigInt(price),  4), fheType: 4 },
    { ciphertextBytes: mockCiphertextBytes(BigInt(amount), 4), fheType: 4 },
  ],
  authorized: NOCTEX_PROGRAM_ID.toBytes(),
  networkEncryptionPublicKey: PRE_ALPHA_NETWORK_KEY,
});

const sig = await program.methods
  .submitOrder(new BN(nonce), sideArg, new PublicKey(ids[0]), new PublicKey(ids[1]))
  .accountsPartial({ order: orderPda, owner: publicKey, systemProgram: SystemProgram.programId })
  .rpc();`,
  },
];

function ProtocolCard({ p }: { p: typeof PROTOCOLS[0] }) {
  return (
    <div style={{
      background: "var(--surface-1)",
      border: "1px solid var(--border)",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Top accent line */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 1,
        background: `linear-gradient(90deg, ${p.color}60, transparent)`,
      }} />

      <div style={{ padding: "20px 24px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 14 }}>
          <span style={{
            fontFamily: "var(--font-display)",
            fontSize: 28,
            fontWeight: 700,
            color: p.color,
            opacity: 0.25,
            lineHeight: 1,
            flexShrink: 0,
          }}>{p.num}</span>
          <div>
            <div style={{
              fontFamily: "var(--font-display)",
              fontSize: 13,
              letterSpacing: "0.18em",
              color: p.color,
              marginBottom: 2,
            }}>{p.name}</div>
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--text-2)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}>{p.tagline}</div>
          </div>
        </div>

        {/* Role description */}
        <p style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--text-1)",
          lineHeight: 1.8,
          marginBottom: 16,
          opacity: 0.85,
        }}>{p.role}</p>

        {/* How it's wired */}
        <div style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          padding: "12px 14px",
          marginBottom: 12,
        }}>
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            letterSpacing: "0.16em",
            color: "var(--text-2)",
            marginBottom: 10,
            textTransform: "uppercase",
          }}>INTEGRATION DETAILS</div>
          {p.how.map(({ label, value }) => (
            <div key={label} style={{
              display: "grid",
              gridTemplateColumns: "130px 1fr",
              marginBottom: 5,
              fontFamily: "var(--font-mono)",
              fontSize: 9,
            }}>
              <span style={{ color: "var(--text-2)", letterSpacing: "0.08em" }}>{label}</span>
              <span style={{ color: "var(--text-1)" }}>{value}</span>
            </div>
          ))}
        </div>

        {/* Links */}
        <div style={{ display: "flex", gap: 10 }}>
          {p.links.map(({ label, href }) => (
            <a key={label} href={href} target="_blank" rel="noopener noreferrer" style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: "0.1em",
              color: p.color,
              border: `1px solid ${p.color}30`,
              padding: "3px 9px",
              textDecoration: "none",
              transition: "background 0.15s",
            }}
              onMouseEnter={e => (e.currentTarget.style.background = `${p.color}10`)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              ↗ {label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function CodeBlock({ title, lang, code }: { title: string; lang: string; code: string }) {
  return (
    <div style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 14px",
        borderBottom: "1px solid var(--border)",
      }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-2)", letterSpacing: "0.1em" }}>{title}</span>
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          color: "var(--accent)",
          border: "1px solid rgba(0,255,136,0.2)",
          padding: "1px 6px",
          letterSpacing: "0.12em",
        }}>{lang}</span>
      </div>
      <pre style={{
        margin: 0,
        padding: "14px 16px",
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        lineHeight: 1.7,
        color: "var(--text-1)",
        overflowX: "auto",
        background: "transparent",
      }}>{code}</pre>
    </div>
  );
}

export default function DocsPage() {
  return (
    <main style={{ paddingTop: 80, minHeight: "100vh" }}>
      {/* Page header */}
      <div style={{
        padding: "20px 24px",
        borderBottom: "1px solid var(--border)",
        background: "rgba(0,255,136,0.015)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
      }}>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 18, letterSpacing: "0.18em", color: "var(--text-1)", marginBottom: 4 }}>
            PROTOCOL DOCS
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)", letterSpacing: "0.08em" }}>
            Three protocols, one story — Bridgeless Encrypted Capital Markets on Solana
          </div>
        </div>
        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          color: "var(--text-2)",
          background: "var(--surface-1)",
          border: "1px solid var(--border)",
          padding: "6px 12px",
        }}>
          PROGRAM: {PROGRAM_ID.slice(0, 12)}…{PROGRAM_ID.slice(-8)}
        </div>
      </div>

      <div style={{ padding: 24 }}>
        {/* Architecture diagram */}
        <div style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border)",
          padding: "16px 20px",
          marginBottom: 24,
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--text-2)",
          lineHeight: 2,
        }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 9, letterSpacing: "0.2em", color: "var(--text-2)", marginBottom: 12 }}>
            ORDER LIFECYCLE
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 0, flexWrap: "wrap" }}>
            {[
              { label: "SUBMIT ORDER",     color: "var(--accent)",  detail: "createInput → Order PDA" },
              { label: "EXECUTE MATCH",    color: "var(--accent)",  detail: "execute_graph CPI" },
              { label: "SETTLE MATCH",     color: "var(--accent)",  detail: "→ Settled" },
              { label: "SIGN SETTLEMENT",  color: "#60a5fa",        detail: "approve_message CPI" },
              { label: "IKA 2PC-MPC",      color: "#60a5fa",        detail: "off-chain signature" },
              { label: "FINALIZE",         color: "#60a5fa",        detail: "verify sig → Finalized" },
              { label: "LI.FI BRIDGE",     color: "#a78bfa",        detail: "optional cross-chain" },
            ].map(({ label, color, detail }, i, arr) => (
              <div key={label} style={{ display: "flex", alignItems: "center" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{
                    padding: "5px 10px",
                    border: `1px solid ${color}40`,
                    color,
                    fontSize: 9,
                    letterSpacing: "0.1em",
                    background: `${color}08`,
                  }}>{label}</div>
                  <div style={{ fontSize: 8, color: "var(--text-2)", marginTop: 3 }}>{detail}</div>
                </div>
                {i < arr.length - 1 && (
                  <span style={{ color: "var(--text-2)", padding: "0 4px", fontSize: 10 }}>→</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Protocol cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, marginBottom: 28, border: "1px solid var(--border)" }}>
          {PROTOCOLS.map(p => <ProtocolCard key={p.num} p={p} />)}
        </div>

        {/* Code snippets */}
        <div style={{ marginBottom: 8 }}>
          <div style={{
            fontFamily: "var(--font-display)",
            fontSize: 10,
            letterSpacing: "0.2em",
            color: "var(--text-2)",
            marginBottom: 14,
          }}>
            KEY INTEGRATION CODE
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {CODE_SNIPPETS.map(s => <CodeBlock key={s.title} {...s} />)}
          </div>
        </div>
      </div>
    </main>
  );
}
