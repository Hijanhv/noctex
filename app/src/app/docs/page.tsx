"use client";

const PROGRAM_ID = "833YAgrbapXnLiYkUq6tG6hWfZ7whX34Xs7CtBN8Nrvx";

const PROTOCOLS = [
  {
    num: "01",
    name: "ENCRYPT FHE SDK",
    tagline: "Homomorphic order matching",
    color: "var(--accent)",
    role: "Orders are encrypted client-side using FHE ciphertexts. The matching engine runs match_orders entirely on encrypted data — the program never sees plaintext prices or sizes. Only the final execution result (fill amounts, exec price) is revealed at settlement.",
    how: [
      { label: "Instruction",  value: "submit_order, execute_match" },
      { label: "DSL macro",    value: "#[encrypt_fn] match_orders(bid, ask) → (fill, exec_price)" },
      { label: "Key types",    value: "EUint64 ciphertexts for all numeric fields" },
      { label: "CPI seed",     value: 'b"__encrypt_cpi_authority"' },
      { label: "Program",      value: "4ebfzWdKnrnGseuQpezXdG8yCdHqwQ1SSBHD3bWArND8 (devnet)" },
    ],
    links: [{ label: "docs.encrypt.xyz", href: "https://docs.encrypt.xyz" }],
  },
  {
    num: "02",
    name: "IKA dWALLET — 2PC-MPC",
    tagline: "Distributed settlement signing",
    color: "#60a5fa",
    role: "Settlement authorization requires a distributed Ed25519 signature produced by the Ika network via 2PC-MPC. No single party holds the private key. The Noctex program CPI-calls the Ika program to create a MessageApproval PDA; the off-chain Ika network then produces the signature, committing it on-chain.",
    how: [
      { label: "DKG",          value: "gRPC DKG via ika-pre-alpha — produces dWallet PDA + Ed25519 pubkey" },
      { label: "CPI call",     value: "sign_settlement → invoke approve_message on Ika program" },
      { label: "MessageApproval", value: "86ckVnh4twmLruwH42YSwNrehNWZd6VdGfNBUnsXGbsJ (status=Signed)" },
      { label: "Signature",    value: "f231157b…700b (64-byte Ed25519 on-chain)" },
      { label: "dWallet PDA",  value: "3om31VWzJx6oPt37qYcUSZFosfFGZgeegX7VjQBi7aRG" },
      { label: "Hash scheme",  value: "keccak256 (both client TS + Rust bootstrap must match)" },
    ],
    links: [{ label: "solana-pre-alpha.ika.xyz", href: "https://solana-pre-alpha.ika.xyz" }],
  },
  {
    num: "03",
    name: "LI.FI SDK",
    tagline: "Cross-chain token delivery",
    color: "#a78bfa",
    role: "After a settlement is authorized by the dWallet signature, LI.FI routes the settled tokens cross-chain. A single settlement signature on Solana unlocks delivery to any supported EVM chain. The SDK is used to get bridge quotes and execute cross-chain transfers after settlement.",
    how: [
      { label: "SDK",          value: "@lifi/sdk — getQuote, executeRoute" },
      { label: "Widget",       value: "@lifi/widget — embeddable swap/bridge UI" },
      { label: "Flow",         value: "settle_match → MessageApproval signed → LI.FI bridge route" },
      { label: "Chains",       value: "Solana → Ethereum / Arbitrum / Base / Optimism" },
      { label: "Integration",  value: "SettlementRoute component in Trade page" },
    ],
    links: [{ label: "li.fi/sdk", href: "https://li.fi" }],
  },
];

const CODE_SNIPPETS = [
  {
    title: "FHE match_orders (programs/noctex/src/fhe.rs)",
    lang: "rust",
    code: `#[encrypt_fn]
pub fn match_orders(
    bid_price: EUint64,
    ask_price: EUint64,
    bid_amount: EUint64,
    ask_amount: EUint64,
) -> (EUint64, EUint64, EUint64) {
    let matched = bid_price.is_greater_or_equal(&ask_price);
    let min_amount = bid_amount.min(&ask_amount);
    let fill = if matched { min_amount } else { EUint64::from(0u64) };
    let exec  = if matched { ask_price  } else { EUint64::from(0u64) };
    (fill, fill, exec)
}`,
  },
  {
    title: "Ika CPI approve_message (programs/noctex/src/dwallet.rs)",
    lang: "rust",
    code: `pub fn invoke_approve_message(ctx: &Context<SignSettlement>, ...) {
    let data = approve_message_data(bump, msg_digest, meta_digest, user, scheme);
    let accounts = vec![
        ctx.accounts.dwallet.to_account_metas(None),
        ctx.accounts.message_approval.to_account_metas(None),
        ctx.accounts.cpi_authority.to_account_metas(None),
        ctx.accounts.coordinator.to_account_metas(None),
        ctx.accounts.payer.to_account_metas(None),
        ctx.accounts.system_program.to_account_metas(None),
        ctx.accounts.caller_program.to_account_metas(None),
    ];
    invoke_signed(&ix, &account_infos, &[CPI_AUTHORITY_SEED]);
}`,
  },
  {
    title: "LI.FI route after settlement (client/src/lifi-settle.ts)",
    lang: "typescript",
    code: `import { createConfig, getQuote, executeRoute } from "@lifi/sdk";

createConfig({ integrator: "noctex" });

export async function bridgeSettlement(
  fromChain: "SOL",
  toChain: number,  // Arbitrum=42161, Base=8453
  amount: string,
  fromToken: string,
  toToken: string,
) {
  const quote = await getQuote({
    fromChain, toChain,
    fromToken, toToken,
    fromAmount: amount,
    fromAddress: walletPubkey,
  });
  return executeRoute(quote.routes[0]);
}`,
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
              { label: "SUBMIT ORDER",    color: "var(--accent)",  detail: "FHE encrypt" },
              { label: "EXECUTE MATCH",   color: "var(--accent)",  detail: "match_orders(EUint64)" },
              { label: "SETTLE MATCH",    color: "var(--accent)",  detail: "set Settled status" },
              { label: "SIGN SETTLEMENT", color: "#60a5fa",        detail: "Ika CPI → approve_message" },
              { label: "dWALLET SIGNS",   color: "#60a5fa",        detail: "2PC-MPC Ed25519" },
              { label: "LIFI BRIDGE",     color: "#a78bfa",        detail: "cross-chain delivery" },
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
