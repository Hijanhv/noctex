"use client";

import { useState } from "react";

const CHAINS = [
  { id: 1,     name: "Ethereum",  symbol: "ETH",  color: "#627eea" },
  { id: 42161, name: "Arbitrum",  symbol: "ARB",  color: "#28a0f0" },
  { id: 8453,  name: "Base",      symbol: "BASE", color: "#0052ff" },
  { id: 10,    name: "Optimism",  symbol: "OP",   color: "#ff0420" },
];

const TOKENS = ["USDC", "USDT", "ETH", "WBTC"];

interface RouteStep {
  protocol: string;
  from: string;
  to: string;
  fee: string;
}

interface Quote {
  toAmount: string;
  estimatedTime: number;
  gasCost: string;
  steps: RouteStep[];
}

function mockQuote(amount: string, toChain: typeof CHAINS[0], token: string): Quote {
  const base = parseFloat(amount) || 0;
  const fee = base * 0.0012;
  return {
    toAmount: (base - fee).toFixed(2),
    estimatedTime: Math.floor(Math.random() * 60 + 30),
    gasCost: (Math.random() * 3 + 0.5).toFixed(2),
    steps: [
      { protocol: "LI.FI Bridge", from: `Solana / USDC`, to: `${toChain.name} / ${token}`, fee: `$${fee.toFixed(4)}` },
    ],
  };
}

export function LifiSettlement() {
  const [toChain, setToChain] = useState(CHAINS[1]);
  const [toToken, setToToken] = useState("USDC");
  const [amount, setAmount] = useState("1854.00");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [bridging, setBridging] = useState(false);
  const [bridged, setBridged] = useState(false);

  const getQuote = async () => {
    setLoading(true);
    await new Promise(r => setTimeout(r, 900));
    setQuote(mockQuote(amount, toChain, toToken));
    setLoading(false);
  };

  const executeBridge = async () => {
    setBridging(true);
    await new Promise(r => setTimeout(r, 2000));
    setBridging(false);
    setBridged(true);
  };

  return (
    <div className="noctex-card" style={{ height: "100%" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px",
        borderBottom: "1px solid var(--border)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 11, letterSpacing: "0.15em", color: "var(--text-2)" }}>
            LI.FI CROSS-CHAIN
          </span>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em",
            color: "#a78bfa", border: "1px solid #a78bfa40", padding: "1px 6px",
          }}>BRIDGE</span>
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-2)" }}>
          SOL → {toChain.name}
        </span>
      </div>

      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Settlement amount (locked from Ika settlement) */}
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-2)", letterSpacing: "0.12em", marginBottom: 6 }}>
            SETTLED AMOUNT (FROM dWALLET)
          </div>
          <div style={{
            display: "flex", alignItems: "center",
            background: "var(--surface-2)", border: "1px solid rgba(0,255,136,0.15)",
            padding: "0 12px", height: 40,
          }}>
            <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-2)", fontSize: 11, marginRight: 8 }}>$</span>
            <input
              type="number"
              value={amount}
              onChange={e => { setAmount(e.target.value); setQuote(null); setBridged(false); }}
              style={{ flex: 1, fontSize: 15, fontFamily: "var(--font-mono)", color: "var(--accent)", background: "transparent" }}
            />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-2)" }}>USDC · Solana</span>
          </div>
        </div>

        {/* Arrow */}
        <div style={{ textAlign: "center", color: "#a78bfa", fontSize: 16 }}>↓</div>

        {/* Destination chain */}
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-2)", letterSpacing: "0.12em", marginBottom: 6 }}>
            DESTINATION CHAIN
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {/* Chain selector */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {CHAINS.map(c => (
                <button
                  key={c.id}
                  onClick={() => { setToChain(c); setQuote(null); setBridged(false); }}
                  style={{
                    padding: "6px 10px",
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    letterSpacing: "0.08em",
                    background: toChain.id === c.id ? `${c.color}15` : "var(--surface-2)",
                    border: `1px solid ${toChain.id === c.id ? c.color + "60" : "var(--border)"}`,
                    color: toChain.id === c.id ? c.color : "var(--text-2)",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.12s",
                  }}
                >
                  {c.name}
                </button>
              ))}
            </div>

            {/* Token selector */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {TOKENS.map(t => (
                <button
                  key={t}
                  onClick={() => { setToToken(t); setQuote(null); setBridged(false); }}
                  style={{
                    padding: "6px 10px",
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    letterSpacing: "0.08em",
                    background: toToken === t ? "rgba(167,139,250,0.1)" : "var(--surface-2)",
                    border: `1px solid ${toToken === t ? "#a78bfa40" : "var(--border)"}`,
                    color: toToken === t ? "#a78bfa" : "var(--text-2)",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.12s",
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Get Quote */}
        {!quote && !bridged && (
          <button
            onClick={getQuote}
            disabled={loading}
            style={{
              padding: "10px 0",
              fontFamily: "var(--font-display)",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.18em",
              background: "rgba(167,139,250,0.08)",
              color: "#a78bfa",
              border: "1px solid rgba(167,139,250,0.25)",
              cursor: loading ? "wait" : "pointer",
              transition: "all 0.15s",
            }}
          >
            {loading ? "GETTING ROUTE…" : "GET LIFI QUOTE →"}
          </button>
        )}

        {/* Quote result */}
        {quote && !bridged && (
          <>
            <div style={{
              background: "var(--surface-2)",
              border: "1px solid rgba(167,139,250,0.2)",
              padding: "12px 14px",
            }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-2)", letterSpacing: "0.12em", marginBottom: 10 }}>
                LI.FI ROUTE FOUND
              </div>
              {[
                { label: "You receive",    value: `${quote.toAmount} ${toToken}` },
                { label: "On chain",       value: toChain.name },
                { label: "Est. time",      value: `~${quote.estimatedTime}s` },
                { label: "Gas cost",       value: `$${quote.gasCost}` },
                { label: "Bridge",         value: "LI.FI Aggregator" },
              ].map(({ label, value }) => (
                <div key={label} style={{
                  display: "flex", justifyContent: "space-between",
                  fontFamily: "var(--font-mono)", fontSize: 10, marginBottom: 5,
                }}>
                  <span style={{ color: "var(--text-2)" }}>{label}</span>
                  <span style={{ color: label === "You receive" ? "#a78bfa" : "var(--text-1)" }}>{value}</span>
                </div>
              ))}
            </div>

            <button
              onClick={executeBridge}
              disabled={bridging}
              style={{
                padding: "11px 0",
                fontFamily: "var(--font-display)",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.18em",
                background: "rgba(167,139,250,0.12)",
                color: "#a78bfa",
                border: "1px solid rgba(167,139,250,0.35)",
                cursor: bridging ? "wait" : "pointer",
              }}
            >
              {bridging ? "BRIDGING…" : `BRIDGE TO ${toChain.name.toUpperCase()}`}
            </button>
          </>
        )}

        {/* Success */}
        {bridged && (
          <div style={{
            padding: "14px",
            background: "rgba(167,139,250,0.06)",
            border: "1px solid rgba(167,139,250,0.25)",
            textAlign: "center",
          }}>
            <div style={{ color: "#a78bfa", fontSize: 18, marginBottom: 6 }}>✓</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 11, letterSpacing: "0.18em", color: "#a78bfa", marginBottom: 4 }}>
              BRIDGE INITIATED
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-2)" }}>
              {amount} USDC → {toToken} on {toChain.name} via LI.FI
            </div>
          </div>
        )}

        {/* SDK attribution */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          paddingTop: 8, borderTop: "1px solid var(--border)",
          fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-2)", letterSpacing: "0.1em",
        }}>
          <span>POWERED BY @lifi/sdk v3</span>
          <span style={{ color: "#a78bfa", opacity: 0.6 }}>li.fi</span>
        </div>
      </div>
    </div>
  );
}
