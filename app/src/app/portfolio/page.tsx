"use client";

import { useWallet } from "@/components/WalletProvider";
import { useState } from "react";

const DEMO_ORDERS = [
  {
    id: "9nywgQgc",
    full: "9nywgQgcSLGb5awMjQ56Gv83hAZ1oGGViB7ADCau3vzx",
    side: "BUY",
    pair: "SOL/USDC",
    price: "148.3200",
    amount: "12.500",
    status: "SETTLED",
    time: "10:41:55",
    txHash: "4gMUvjZg",
  },
  {
    id: "5AygnLoC",
    full: "5AygnLoCvHDiW5keinpE1YpnsCEccKrCJ6JsoKtXNLzd",
    side: "SELL",
    pair: "SOL/USDC",
    price: "148.3150",
    amount: "12.500",
    status: "SETTLED",
    time: "10:39:44",
    txHash: "4gMUvjZg",
  },
  {
    id: "Bx3kLmNp",
    full: "Bx3kLmNp9fGhJk2mQrUv7yAd4wC6sE8pT1nXzRoWbYq",
    side: "BUY",
    pair: "ETH/USDC",
    price: "2841.50",
    amount: "0.420",
    status: "PENDING",
    time: "10:43:02",
    txHash: null,
  },
];

const STATUS_COLOR: Record<string, string> = {
  SETTLED: "var(--accent)",
  MATCHED: "#60a5fa",
  PENDING: "#f59e0b",
  CANCELLED: "var(--sell)",
};

function StatCard({ label, value, sub, color = "var(--accent)" }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div style={{
      background: "var(--surface-1)",
      border: "1px solid var(--border)",
      padding: "16px 20px",
      position: "relative",
    }}>
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 1,
        background: `linear-gradient(90deg, transparent, ${color}30, transparent)`,
      }} />
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-2)", letterSpacing: "0.14em", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, color, fontWeight: 500, lineHeight: 1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-2)", marginTop: 6, letterSpacing: "0.08em" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export default function PortfolioPage() {
  const { connected, publicKey } = useWallet();
  const [tab, setTab] = useState<"open" | "history">("open");

  const open = DEMO_ORDERS.filter(o => o.status === "PENDING");
  const history = DEMO_ORDERS.filter(o => o.status !== "PENDING");

  return (
    <main style={{ paddingTop: 80, minHeight: "100vh" }}>
      {/* Page header */}
      <div style={{
        padding: "20px 24px 0",
        borderBottom: "1px solid var(--border)",
        background: "rgba(0,255,136,0.015)",
      }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", paddingBottom: 16 }}>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, letterSpacing: "0.18em", color: "var(--text-1)", marginBottom: 4 }}>
              PORTFOLIO
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)", letterSpacing: "0.1em" }}>
              {connected && publicKey
                ? `${publicKey.toBase58().slice(0, 8)}…${publicKey.toBase58().slice(-8)}`
                : "CONNECT WALLET TO VIEW ORDERS"}
            </div>
          </div>

          {/* dWallet badge */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "var(--surface-1)",
            border: "1px solid var(--border)",
            padding: "8px 14px",
          }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-2)", letterSpacing: "0.1em" }}>
              dWALLET 3om31VWz… ACTIVE
            </span>
          </div>
        </div>
      </div>

      <div style={{ padding: 24 }}>
        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, marginBottom: 28, border: "1px solid var(--border)" }}>
          <StatCard label="TOTAL VOLUME" value="$1,854.00" sub="2 settled orders" />
          <StatCard label="OPEN ORDERS"  value={open.length.toString()} sub="FHE encrypted" color="#f59e0b" />
          <StatCard label="SETTLED"      value={history.length.toString()} sub="Via dWallet 2PC-MPC" />
          <StatCard label="dWALLET SIG"  value="1" sub="Ed25519 on-chain" color="#a78bfa" />
        </div>

        {/* Live dWallet proof */}
        <div style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border)",
          padding: "14px 18px",
          marginBottom: 28,
          display: "flex",
          alignItems: "center",
          gap: 20,
          flexWrap: "wrap",
        }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 9, letterSpacing: "0.18em", color: "var(--text-2)" }}>
            IKA dWALLET SETTLEMENT
          </span>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            {[
              { label: "MessageApproval", value: "86ckVnh4…XGbsJ" },
              { label: "Status", value: "SIGNED (Ed25519)" },
              { label: "Signature", value: "f231157b…700b" },
              { label: "dWallet PDA", value: "3om31VWz…7aRG" },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-2)", letterSpacing: "0.1em" }}>{label}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent)", marginTop: 2 }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Order tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--border)", marginBottom: 0 }}>
          {(["open", "history"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              padding: "10px 20px",
              background: "transparent",
              border: "none",
              borderBottom: tab === t ? "1px solid var(--accent)" : "1px solid transparent",
              color: tab === t ? "var(--accent)" : "var(--text-2)",
              cursor: "pointer",
            }}>
              {t === "open" ? `Open (${open.length})` : `History (${history.length})`}
            </button>
          ))}
        </div>

        {/* Orders table */}
        <div style={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderTop: "none" }}>
          {/* Header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "90px 100px 120px 120px 120px 100px 1fr",
            padding: "8px 16px",
            borderBottom: "1px solid var(--border)",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.12em",
            color: "var(--text-2)",
          }}>
            <span>ORDER ID</span>
            <span>SIDE</span>
            <span>PAIR</span>
            <span>PRICE</span>
            <span>AMOUNT</span>
            <span>STATUS</span>
            <span>TIME</span>
          </div>

          {/* Rows */}
          {(tab === "open" ? open : history).length === 0 ? (
            <div style={{ padding: "32px 16px", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)" }}>
              {tab === "open" ? "No open orders" : "No order history"}
            </div>
          ) : (
            (tab === "open" ? open : history).map(order => (
              <div
                key={order.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "90px 100px 120px 120px 120px 100px 1fr",
                  padding: "12px 16px",
                  borderBottom: "1px solid rgba(0,255,136,0.04)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  alignItems: "center",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,255,136,0.02)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{ color: "var(--text-1)", fontSize: 9 }}>{order.id}…</span>
                <span style={{ color: order.side === "BUY" ? "var(--accent)" : "var(--sell)", fontWeight: 600, letterSpacing: "0.1em" }}>
                  {order.side === "BUY" ? "▲" : "▼"} {order.side}
                </span>
                <span style={{ color: "var(--text-1)" }}>{order.pair}</span>
                <span style={{ color: "var(--text-1)" }}>${order.price}</span>
                <span style={{ color: "var(--text-1)" }}>{order.amount}</span>
                <span style={{
                  color: STATUS_COLOR[order.status] ?? "var(--text-2)",
                  fontSize: 9,
                  letterSpacing: "0.1em",
                  border: `1px solid ${STATUS_COLOR[order.status] ?? "var(--border)"}`,
                  padding: "2px 6px",
                  display: "inline-block",
                }}>
                  {order.status}
                </span>
                <span style={{ color: "var(--text-2)", fontSize: 9 }}>{order.time}</span>
              </div>
            ))
          )}
        </div>

        {/* Encrypt FHE note */}
        <div style={{
          marginTop: 20,
          padding: "12px 16px",
          background: "var(--surface-1)",
          border: "1px solid var(--border)",
          display: "flex",
          gap: 12,
          alignItems: "flex-start",
        }}>
          <span style={{ color: "var(--accent)", fontSize: 14, flexShrink: 0 }}>◈</span>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 9, letterSpacing: "0.16em", color: "var(--accent)", marginBottom: 4 }}>
              FHE ORDER PRIVACY
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-2)", lineHeight: 1.8 }}>
              All pending orders are encrypted with <strong style={{ color: "var(--text-1)" }}>Encrypt FHE SDK</strong>.
              Price and size remain hidden until the matching engine runs <code style={{ color: "var(--accent)" }}>match_orders</code> on
              ciphertexts. Only execution results are revealed on settlement.
              Settlement is authorized by <strong style={{ color: "var(--text-1)" }}>Ika dWallet 2PC-MPC</strong> — no single key holder.
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
