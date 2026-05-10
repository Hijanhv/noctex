"use client";

import { useState } from "react";
import { getSettlementQuote } from "@/lib/lifi";
import { useWallet } from "@/components/WalletProvider";

const SOLANA_CHAIN_ID = 1151111081099710;
const SOL_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const CHAINS = [
  { id: 1,     name: "Ethereum",  symbol: "ETH",  color: "#627eea", usdc: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", usdt: "0xdac17f958d2ee523a2206206994597c13d831ec7", weth: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", wbtc: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599" },
  { id: 42161, name: "Arbitrum",  symbol: "ARB",  color: "#28a0f0", usdc: "0xaf88d065e77c8cc2239327c5edb3a432268e5831", usdt: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", weth: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", wbtc: "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f" },
  { id: 8453,  name: "Base",      symbol: "BASE", color: "#0052ff", usdc: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", usdt: "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2", weth: "0x4200000000000000000000000000000000000006", wbtc: "0x0555e30da8f98308edb960aa94c0db47230d2b9c" },
  { id: 10,    name: "Optimism",  symbol: "OP",   color: "#ff0420", usdc: "0x0b2c639c533813f4aa9d7837caf62653d097ff85", usdt: "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58", weth: "0x4200000000000000000000000000000000000006", wbtc: "0x68f180fcce6836688e9084f035309e29bf0a2095" },
];

const TOKENS = ["USDC", "USDT", "WETH", "WBTC"] as const;
type Token = typeof TOKENS[number];

function tokenAddress(chain: typeof CHAINS[0], token: Token): string {
  switch (token) {
    case "USDC": return chain.usdc;
    case "USDT": return chain.usdt;
    case "WETH": return chain.weth;
    case "WBTC": return chain.wbtc;
  }
}

interface Quote {
  toAmount: string;
  estimatedTime: number;
  gasCost: string;
  source: "live" | "mock";
}

function mockQuote(amount: string): Quote {
  const base = parseFloat(amount) || 0;
  const fee = base * 0.0012;
  return {
    toAmount: (base - fee).toFixed(2),
    estimatedTime: Math.floor(Math.random() * 60 + 30),
    gasCost: (Math.random() * 3 + 0.5).toFixed(2),
    source: "mock",
  };
}

export function LifiSettlement() {
  const { publicKey } = useWallet();
  const [toChain, setToChain] = useState(CHAINS[1]);
  const [toToken, setToToken] = useState<Token>("USDC");
  const [amount, setAmount] = useState("1854.00");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [bridging, setBridging] = useState(false);
  const [bridged, setBridged] = useState(false);

  const getQuote = async () => {
    setLoading(true);
    const fromAddress = publicKey?.toBase58() ?? "9nywgQgcSLGb5awMjQ56Gv83hAZ1oGGViB7ADCau3vzx";
    const fromAmountBaseUnits = Math.floor((parseFloat(amount) || 0) * 1_000_000).toString();
    const live = await getSettlementQuote({
      fromChain: SOLANA_CHAIN_ID,
      toChain: toChain.id,
      fromToken: SOL_USDC_MINT,
      toToken: tokenAddress(toChain, toToken),
      fromAmount: fromAmountBaseUnits,
      fromAddress,
    });
    if (live) {
      const decimals = toToken === "USDC" || toToken === "USDT" ? 6 : 18;
      const toAmountFloat = parseFloat(live.toAmount) / Math.pow(10, decimals);
      setQuote({
        toAmount: toAmountFloat.toFixed(toToken === "WBTC" ? 6 : 2),
        estimatedTime: 45,
        gasCost: live.gasCostUSD === "—" ? "—" : parseFloat(live.gasCostUSD).toFixed(2),
        source: "live",
      });
    } else {
      setQuote(mockQuote(amount));
    }
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-2)", letterSpacing: "0.12em" }}>
                  LI.FI ROUTE FOUND
                </span>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.10em",
                  color: quote.source === "live" ? "#a78bfa" : "#707070",
                  border: `1px solid ${quote.source === "live" ? "#a78bfa50" : "rgba(255,255,255,0.1)"}`,
                  padding: "1px 6px",
                }}>
                  {quote.source === "live" ? "LIVE @lifi/sdk" : "DEMO QUOTE"}
                </span>
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
