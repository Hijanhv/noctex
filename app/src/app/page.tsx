"use client";

import { useEffect, useState } from "react";
import { OrderForm } from "@/components/OrderForm";
import { OrderBook } from "@/components/OrderBook";
import { ActivityFeed } from "@/components/ActivityFeed";
import { LifiSettlement } from "@/components/LifiSettlement";

const PROGRAM_ID = "833YAgrbapXnLiYkUq6tG6hWfZ7whX34Xs7CtBN8Nrvx";

function HeroStrip() {
  const [cursor, setCursor] = useState(true);
  const words = ["ENCRYPTED", "DARK POOL", "ORDERS"];
  const [wordIdx, setWordIdx] = useState(0);

  useEffect(() => {
    const c = setInterval(() => setCursor(v => !v), 530);
    const w = setInterval(() => setWordIdx(i => (i + 1) % words.length), 1800);
    return () => { clearInterval(c); clearInterval(w); };
  }, []);

  return (
    <div
      style={{
        borderBottom: "1px solid rgba(0,255,136,0.06)",
        padding: "14px 24px",
        display: "flex",
        alignItems: "center",
        gap: 24,
        background: "rgba(0,255,136,0.015)",
        flexWrap: "wrap",
      }}
    >
      {/* Animated headline */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{
          fontFamily: "var(--font-display)",
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.22em",
          color: "var(--accent)",
        }}>
          {words[wordIdx]}
          <span style={{ opacity: cursor ? 1 : 0, color: "var(--accent)" }}>█</span>
        </span>
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--text-3)",
          letterSpacing: "0.1em",
        }}>
          ON SOLANA
        </span>
      </div>

      <span style={{ color: "var(--border-mid)" }}>│</span>

      {/* Protocol stack */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {[
          { label: "Encrypt FHE", desc: "Hidden orders" },
          { label: "Ika dWallet", desc: "2PC-MPC sign" },
          { label: "LI.FI", desc: "Cross-chain" },
        ].map(({ label, desc }) => (
          <div key={label} style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontFamily: "var(--font-mono)",
            fontSize: 9,
          }}>
            <span style={{
              color: "var(--accent)",
              border: "1px solid rgba(0,255,136,0.2)",
              padding: "1px 6px",
              letterSpacing: "0.1em",
            }}>{label}</span>
            <span style={{ color: "var(--text-3)", letterSpacing: "0.06em" }}>{desc}</span>
          </div>
        ))}
      </div>

      <div style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-3)" }}>
        {PROGRAM_ID.slice(0, 8)}…{PROGRAM_ID.slice(-8)}
      </div>
    </div>
  );
}

function EncryptedTerminal() {
  const LINES = [
    { t: 0,    text: "> noctex-ika-bootstrap init 833YAgrb…",   color: "var(--text-1)" },
    { t: 400,  text: "  ✓ DKG complete — dWallet: 3om31VWz…",   color: "var(--accent)" },
    { t: 800,  text: "  ✓ Transfer to CPI authority — OK",       color: "var(--accent)" },
    { t: 1200, text: "> sign_settlement SOL/USDC 12.5 …",        color: "var(--text-1)" },
    { t: 1600, text: "  ◈ FHE match_orders: bid >= ask → true",  color: "#60a5fa" },
    { t: 2000, text: "  ✓ MessageApproval: 86ckVnh4… signed",    color: "var(--accent)" },
    { t: 2400, text: "  ✓ Ed25519 sig on-chain: f231157b…",      color: "var(--accent)" },
  ];

  const [visible, setVisible] = useState(0);

  useEffect(() => {
    LINES.forEach(({ t }, i) => {
      setTimeout(() => setVisible(v => Math.max(v, i + 1)), t + 300);
    });
  }, []);

  return (
    <div style={{
      background: "var(--surface-1)",
      border: "1px solid var(--border)",
      padding: "14px 16px",
      fontFamily: "var(--font-mono)",
      fontSize: 10,
      lineHeight: 1.9,
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Scanline */}
      <div style={{
        position: "absolute",
        inset: 0,
        background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)",
        pointerEvents: "none",
      }} />

      {/* Header bar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        marginBottom: 10,
        paddingBottom: 8,
        borderBottom: "1px solid var(--border)",
      }}>
        {["#e74c3c", "#f39c12", "var(--accent)"].map((c, i) => (
          <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: c, opacity: 0.7 }} />
        ))}
        <span style={{ marginLeft: 8, color: "var(--text-3)", letterSpacing: "0.12em", fontSize: 9 }}>
          NOCTEX TERMINAL — devnet
        </span>
      </div>

      {LINES.slice(0, visible).map(({ text, color }, i) => (
        <div key={i} style={{ color, letterSpacing: "0.04em" }}>
          {text}
        </div>
      ))}
      {visible < LINES.length && (
        <span style={{ color: "var(--accent)", animation: "cursor-blink 1s step-end infinite" }}>█</span>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <main style={{ paddingTop: 80, minHeight: "100vh" }}>
      <HeroStrip />

      {/* 4-column trading grid — all 3 protocols visible */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "320px 1fr 300px 280px",
        gap: 0,
        borderBottom: "1px solid var(--border)",
      }}>
        {/* Col 1: Order Form (Encrypt FHE) */}
        <div style={{ borderRight: "1px solid var(--border)" }}>
          <OrderForm />
        </div>

        {/* Col 2: Order Book */}
        <div style={{ borderRight: "1px solid var(--border)" }}>
          <OrderBook />
        </div>

        {/* Col 3: Activity Feed (Ika dWallet events) */}
        <div style={{ borderRight: "1px solid var(--border)" }}>
          <ActivityFeed />
        </div>

        {/* Col 4: LI.FI Cross-Chain */}
        <div>
          <LifiSettlement />
        </div>
      </div>

      {/* Terminal section */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 0,
        borderBottom: "1px solid var(--border)",
      }}>
        {/* Terminal demo */}
        <div style={{ padding: 24, borderRight: "1px solid var(--border)" }}>
          <div style={{
            fontFamily: "var(--font-display)",
            fontSize: 10,
            letterSpacing: "0.2em",
            color: "var(--text-3)",
            marginBottom: 14,
          }}>
            LIVE E2E SETTLEMENT PROOF
          </div>
          <EncryptedTerminal />
        </div>

        {/* Architecture overview */}
        <div style={{ padding: 24 }}>
          <div style={{
            fontFamily: "var(--font-display)",
            fontSize: 10,
            letterSpacing: "0.2em",
            color: "var(--text-3)",
            marginBottom: 14,
          }}>
            PROTOCOL ARCHITECTURE
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              {
                num: "01",
                title: "FHE ORDER ENCRYPTION",
                desc: "Encrypt SDK compiles match_orders to an FHE circuit. Bid/ask prices stay encrypted until settlement reveals only the execution result.",
                color: "var(--accent)",
              },
              {
                num: "02",
                title: "dWALLET SETTLEMENT",
                desc: "Ika 2PC-MPC produces a distributed Ed25519 signature authorizing each settlement. No single party holds the key.",
                color: "#60a5fa",
              },
              {
                num: "03",
                title: "CROSS-CHAIN DELIVERY",
                desc: "LI.FI routes the settled amounts across chains. A single settlement signature unlocks multi-chain token delivery.",
                color: "#a78bfa",
              },
            ].map(({ num, title, desc, color }) => (
              <div
                key={num}
                style={{
                  display: "flex",
                  gap: 14,
                  padding: "12px 14px",
                  background: "var(--surface-1)",
                  border: "1px solid var(--border)",
                }}
              >
                <span style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 20,
                  fontWeight: 700,
                  color,
                  opacity: 0.3,
                  lineHeight: 1,
                  flexShrink: 0,
                  minWidth: 28,
                }}>
                  {num}
                </span>
                <div>
                  <div style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 10,
                    letterSpacing: "0.16em",
                    color,
                    marginBottom: 4,
                  }}>
                    {title}
                  </div>
                  <div style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--text-1)",
                    lineHeight: 1.7,
                    opacity: 0.75,
                  }}>
                    {desc}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 24px",
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        color: "var(--text-3)",
        letterSpacing: "0.1em",
        flexWrap: "wrap",
        gap: 10,
      }}>
        <div style={{ display: "flex", gap: 20 }}>
          <span>NOCTEX</span>
          <span>COLOSSEUM FRONTIER 2026</span>
          <span style={{ color: "var(--accent)", opacity: 0.5 }}>ENCRYPT + IKA SIDE TRACK</span>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          <span>PROGRAM: {PROGRAM_ID.slice(0, 8)}…</span>
          <span>SOLANA DEVNET</span>
          <span style={{ color: "var(--accent)", opacity: 0.4 }}>◆ BUILT WITH FHE</span>
        </div>
      </footer>
    </main>
  );
}
