"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useWallet } from "@/components/WalletProvider";

type Side = "buy" | "sell";

const SCRAMBLE_CHARS = "0123456789ABCDEF█▓▒░◆◇▪";
const PAIRS = ["SOL/USDC", "ETH/USDC", "BTC/USDC"];

function useScramble(value: string, active: boolean) {
  const [display, setDisplay] = useState(value);
  const frameRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active || !value) { setDisplay(value); return; }
    let iterations = 0;
    const total = 6;
    const run = () => {
      if (iterations >= total) { setDisplay(value); return; }
      setDisplay(
        value.split("").map((ch, i) =>
          i < iterations
            ? ch
            : Math.random() < 0.4
            ? SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)]
            : ch
        ).join("")
      );
      iterations++;
      frameRef.current = setTimeout(run, 40);
    };
    run();
    return () => { if (frameRef.current) clearTimeout(frameRef.current); };
  }, [value, active]);

  return display;
}

function EncryptedBadge() {
  const [chars, setChars] = useState("••••••••••••");
  useEffect(() => {
    const id = setInterval(() => {
      setChars(
        Array.from({ length: 12 }, () =>
          SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)]
        ).join("")
      );
    }, 120);
    return () => clearInterval(id);
  }, []);
  return (
    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--accent)", opacity: 0.35, letterSpacing: "0.05em" }}>
      {chars}
    </span>
  );
}

export function OrderForm() {
  const { connected } = useWallet();

  const [side, setSide] = useState<Side>("buy");
  const [pair, setPair] = useState(PAIRS[0]);
  const [price, setPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [priceFocused, setPriceFocused] = useState(false);
  const [amountFocused, setAmountFocused] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cliCmd, setCliCmd] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const scrambledPrice = useScramble(price, priceFocused);
  const scrambledAmount = useScramble(amount, amountFocused);

  const total = price && amount ? (parseFloat(price) * parseFloat(amount)).toFixed(2) : "—";

  const accent = side === "buy" ? "var(--accent)" : "var(--sell)";
  const accentGlow = side === "buy" ? "var(--accent-glow)" : "var(--sell-glow)";

  const handleSubmit = useCallback(async () => {
    if (!price || !amount || submitting) return;
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 1400));
    const sideArg = side === "buy" ? "Buy" : "Sell";
    setCliCmd(`bun run src/submit-order.ts ${sideArg} ${price} ${amount}`);
    setSubmitting(false);
    setSubmitted(true);
  }, [price, amount, side, submitting]);

  const handleReset = useCallback(() => {
    setSubmitted(false);
    setCliCmd(null);
    setCopied(false);
    setPrice("");
    setAmount("");
  }, []);

  const handleCopy = useCallback(() => {
    if (!cliCmd) return;
    navigator.clipboard?.writeText(cliCmd).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }, [cliCmd]);

  return (
    <div
      className="noctex-card flex flex-col"
      style={{ height: "100%", minHeight: 520 }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2">
          <span style={{ fontFamily: "var(--font-display)", fontSize: 11, letterSpacing: "0.15em", color: "var(--text-2)" }}>
            NEW ORDER
          </span>
        </div>
        <EncryptedBadge />
      </div>

      {/* Pair selector */}
      <div className="flex" style={{ borderBottom: "1px solid var(--border)" }}>
        {PAIRS.map(p => (
          <button
            key={p}
            onClick={() => setPair(p)}
            style={{
              flex: 1,
              padding: "8px 0",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.1em",
              background: pair === p ? accentGlow : "transparent",
              color: pair === p ? accent : "var(--text-3)",
              border: "none",
              borderBottom: pair === p ? `1px solid ${accent}` : "1px solid transparent",
              cursor: "pointer",
              textTransform: "uppercase",
              transition: "all 0.15s",
            }}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Buy / Sell toggle */}
      <div className="flex" style={{ padding: "12px 16px 0" }}>
        {(["buy", "sell"] as Side[]).map(s => (
          <button
            key={s}
            onClick={() => setSide(s)}
            style={{
              flex: 1,
              padding: "9px 0",
              fontFamily: "var(--font-display)",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              cursor: "pointer",
              border: "none",
              transition: "all 0.15s",
              background: side === s
                ? s === "buy" ? "rgba(0,255,136,0.12)" : "rgba(255,61,107,0.12)"
                : "transparent",
              color: side === s
                ? s === "buy" ? "var(--accent)" : "var(--sell)"
                : "var(--text-3)",
              borderBottom: side === s
                ? `1px solid ${s === "buy" ? "var(--accent)" : "var(--sell)"}`
                : "1px solid var(--border)",
            }}
          >
            {s === "buy" ? "▲ BUY" : "▼ SELL"}
          </button>
        ))}
      </div>

      {/* Form fields */}
      <div className="flex flex-col gap-3 px-4 py-4 flex-1">
        {/* Price */}
        <div>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 6,
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.14em",
            color: "var(--text-2)",
            textTransform: "uppercase",
          }}>
            <span>Limit Price</span>
            <span style={{ color: "var(--text-2)" }}>USDC — ENCRYPTED</span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: "var(--surface-2)",
              border: `1px solid ${priceFocused ? accent : "var(--border)"}`,
              padding: "0 12px",
              height: 44,
              transition: "border-color 0.15s",
              boxShadow: priceFocused ? `0 0 0 1px ${accentGlow}` : "none",
            }}
          >
            <span style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)", fontSize: 12, marginRight: 8 }}>$</span>
            <input
              type="number"
              value={price}
              onChange={e => setPrice(e.target.value)}
              onFocus={() => setPriceFocused(true)}
              onBlur={() => setPriceFocused(false)}
              placeholder="0.00"
              style={{
                flex: 1,
                fontSize: 16,
                fontFamily: "var(--font-mono)",
                fontWeight: 400,
                color: accent,
                background: "transparent",
                border: "none",
                outline: "none",
              }}
            />
            {priceFocused && price && (
              <span style={{ fontSize: 9, color: "var(--text-3)", fontFamily: "var(--font-mono)", letterSpacing: "0.05em" }}>
                ~{scrambledPrice}
              </span>
            )}
          </div>
        </div>

        {/* Amount */}
        <div>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 6,
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.14em",
            color: "var(--text-3)",
            textTransform: "uppercase",
          }}>
            <span style={{ color: "var(--text-2)" }}>Amount</span>
            <span style={{ color: "var(--text-2)" }}>{pair.split("/")[0]}</span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: "var(--surface-2)",
              border: `1px solid ${amountFocused ? accent : "var(--border)"}`,
              padding: "0 12px",
              height: 44,
              transition: "border-color 0.15s",
              boxShadow: amountFocused ? `0 0 0 1px ${accentGlow}` : "none",
            }}
          >
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              onFocus={() => setAmountFocused(true)}
              onBlur={() => setAmountFocused(false)}
              placeholder="0.000"
              style={{
                flex: 1,
                fontSize: 16,
                fontFamily: "var(--font-mono)",
                fontWeight: 400,
                color: accent,
                background: "transparent",
                border: "none",
                outline: "none",
              }}
            />
            {amountFocused && amount && (
              <span style={{ fontSize: 9, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
                ~{scrambledAmount}
              </span>
            )}
          </div>
        </div>

        {/* FHE info strip */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          fontSize: 9,
          fontFamily: "var(--font-mono)",
          color: "var(--text-3)",
          letterSpacing: "0.08em",
        }}>
          <span style={{ color: "var(--accent)", opacity: 0.7 }}>◈ FHE</span>
          <span style={{ color: "var(--text-2)" }}>Order hidden until matched</span>
          <span style={{ marginLeft: "auto", color: "var(--text-2)" }}>Encrypt SDK v0</span>
        </div>

        {/* Total */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "10px 0",
          borderTop: "1px solid var(--border)",
          fontFamily: "var(--font-mono)",
        }}>
          <span style={{ fontSize: 10, color: "var(--text-2)", letterSpacing: "0.12em" }}>TOTAL</span>
          <span style={{ fontSize: 14, color: total === "—" ? "var(--text-3)" : accent, fontWeight: 500 }}>
            {total === "—" ? "—" : `$${total}`}
          </span>
        </div>

        {/* Submit / Connect */}
        {!connected ? (
          <button
            disabled
            style={{
              width: "100%",
              padding: "13px 0",
              fontFamily: "var(--font-display)",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              background: "transparent",
              color: "var(--text-3)",
              border: "1px solid var(--border)",
              cursor: "not-allowed",
              opacity: 0.45,
            }}
          >
            CONNECT WALLET TO TRADE
          </button>
        ) : submitted && cliCmd ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--accent)",
              letterSpacing: "0.14em", textTransform: "uppercase",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              ◈ CIPHERTEXTS BUILT — RUN ON-CHAIN
            </div>
            <div style={{
              background: "#000", border: "1px solid rgba(0,255,136,0.30)",
              padding: "10px 12px",
              fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--accent)",
              wordBreak: "break-all", lineHeight: 1.5,
              cursor: "pointer", userSelect: "all",
            }}
              onClick={handleCopy}
              title="Click to copy"
            >
              <span style={{ color: "var(--text-3)" }}>$ </span>{cliCmd}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleCopy} style={{
                flex: 1, padding: "9px 0",
                background: copied ? "rgba(0,255,136,0.15)" : "transparent",
                border: `1px solid ${copied ? "var(--accent)" : "rgba(0,255,136,0.20)"}`,
                color: "var(--accent)",
                fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em",
                textTransform: "uppercase", cursor: "pointer",
              }}>
                {copied ? "✓ COPIED" : "COPY CMD"}
              </button>
              <button onClick={handleReset} style={{
                flex: 1, padding: "9px 0",
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.10)",
                color: "var(--text-2)",
                fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em",
                textTransform: "uppercase", cursor: "pointer",
              }}>
                NEW ORDER
              </button>
            </div>
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-3)",
              letterSpacing: "0.06em", lineHeight: 1.6, marginTop: 2,
            }}>
              Run from <code style={{ color: "var(--text-2)" }}>noctex/client</code>. The Encrypt gRPC executor encrypts price/amount, then submits to program <code style={{ color: "var(--accent)" }}>833YAgrb…</code> on devnet.
            </div>
          </div>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!price || !amount || submitting}
            style={{
              width: "100%",
              padding: "13px 0",
              fontFamily: "var(--font-display)",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              background: side === "buy" ? "rgba(0,255,136,0.12)" : "rgba(255,61,107,0.12)",
              color: side === "buy" ? "var(--accent)" : "var(--sell)",
              border: `1px solid ${accent}`,
              cursor: !price || !amount ? "not-allowed" : "pointer",
              opacity: !price || !amount ? 0.4 : 1,
              transition: "all 0.15s",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {submitting ? "ENCRYPTING ORDER…" : `PLACE ${side.toUpperCase()} ORDER`}
            {submitting && (
              <span style={{
                position: "absolute",
                bottom: 0, left: 0,
                height: 2,
                background: accent,
                animation: "submitProgress 1.4s linear forwards",
              }} />
            )}
          </button>
        )}
      </div>

      <style>{`
        @keyframes submitProgress {
          from { width: 0; }
          to   { width: 100%; }
        }
      `}</style>
    </div>
  );
}
