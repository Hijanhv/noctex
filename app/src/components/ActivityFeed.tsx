"use client";

import { useState, useEffect } from "react";

type EventType = "ORDER_SUBMITTED" | "MATCH_INITIATED" | "SETTLEMENT_SIGNED" | "DWALLET_INIT" | "ORDER_CANCELLED";

interface FeedEvent {
  id: string;
  type: EventType;
  hash: string;
  time: string;
  pair: string;
  amount?: string;
  status: "pending" | "confirmed" | "signed";
}

const TYPE_META: Record<EventType, { label: string; color: string; icon: string }> = {
  ORDER_SUBMITTED:  { label: "ORDER",      color: "var(--accent)",  icon: "◆" },
  MATCH_INITIATED:  { label: "MATCHED",    color: "#60a5fa",        icon: "⇄" },
  SETTLEMENT_SIGNED:{ label: "SIGNED",     color: "var(--accent)",  icon: "✓" },
  DWALLET_INIT:     { label: "dWALLET",    color: "#a78bfa",        icon: "⬡" },
  ORDER_CANCELLED:  { label: "CANCELLED",  color: "var(--sell)",    icon: "✕" },
};

function randomHash12() {
  return Array.from({ length: 12 }, () =>
    Math.floor(Math.random() * 16).toString(16).toUpperCase()
  ).join("");
}

function now() {
  return new Date().toISOString().slice(11, 19);
}

const PAIRS = ["SOL/USDC", "ETH/USDC", "BTC/USDC"];
const TYPES: EventType[] = ["ORDER_SUBMITTED", "MATCH_INITIATED", "SETTLEMENT_SIGNED"];

function makeEvent(): FeedEvent {
  const type = TYPES[Math.floor(Math.random() * TYPES.length)];
  return {
    id: randomHash12(),
    type,
    hash: randomHash12(),
    time: now(),
    pair: PAIRS[Math.floor(Math.random() * PAIRS.length)],
    amount: (Math.random() * 50 + 0.5).toFixed(3),
    status: type === "SETTLEMENT_SIGNED" ? "signed" : type === "MATCH_INITIATED" ? "confirmed" : "pending",
  };
}

const INITIAL: FeedEvent[] = [
  {
    id: "A1", type: "SETTLEMENT_SIGNED",
    hash: "4gMUvjZg",
    time: "10:42:07",
    pair: "SOL/USDC",
    amount: "12.500",
    status: "signed",
  },
  {
    id: "A2", type: "MATCH_INITIATED",
    hash: "9nywgQgc",
    time: "10:41:55",
    pair: "SOL/USDC",
    amount: "12.500",
    status: "confirmed",
  },
  {
    id: "A3", type: "DWALLET_INIT",
    hash: "3om31VWz",
    time: "10:40:12",
    pair: "SOL/USDC",
    amount: undefined,
    status: "confirmed",
  },
  {
    id: "A4", type: "ORDER_SUBMITTED",
    hash: "5AygnLoC",
    time: "10:39:44",
    pair: "SOL/USDC",
    amount: "12.500",
    status: "pending",
  },
];

function EventRow({ ev, isLatest }: { ev: FeedEvent; isLatest: boolean }) {
  const meta = TYPE_META[ev.type];
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 3,
        padding: "10px 14px",
        borderBottom: "1px solid rgba(255,255,255,0.03)",
        animation: "row-appear 0.25s ease forwards",
        background: isLatest ? "rgba(0,255,136,0.02)" : "transparent",
        transition: "background 0.3s",
      }}
    >
      <div className="flex items-center gap-2">
        {/* Live dot for latest */}
        {isLatest ? (
          <span className="live-dot" style={{ flexShrink: 0 }} />
        ) : (
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            border: "1px solid var(--text-3)",
            flexShrink: 0,
          }} />
        )}

        {/* Type badge */}
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          letterSpacing: "0.12em",
          color: meta.color,
          border: `1px solid ${meta.color}`,
          padding: "1px 5px",
          opacity: isLatest ? 1 : 0.6,
          flexShrink: 0,
        }}>
          {meta.icon} {meta.label}
        </span>

        {/* Pair */}
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-2)", marginLeft: "auto" }}>
          {ev.pair}
        </span>

        {/* Time */}
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-2)" }}>
          {ev.time}
        </span>
      </div>

      <div className="flex items-center gap-2" style={{ paddingLeft: 14 }}>
        {/* Hash */}
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--text-1)",
          letterSpacing: "0.06em",
        }}>
          {ev.hash}…
        </span>

        {ev.amount && (
          <>
            <span style={{ color: "var(--text-3)", fontSize: 8 }}>·</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: isLatest ? meta.color : "var(--text-2)" }}>
              {ev.amount}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-3)" }}>
              {ev.pair.split("/")[0]}
            </span>
          </>
        )}

        {/* Status */}
        <span style={{
          marginLeft: "auto",
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          letterSpacing: "0.12em",
          color: ev.status === "signed"
            ? "var(--accent)"
            : ev.status === "confirmed"
            ? "#60a5fa"
            : "var(--text-3)",
          textTransform: "uppercase",
        }}>
          {ev.status}
        </span>
      </div>
    </div>
  );
}

export function ActivityFeed() {
  const [events, setEvents] = useState<FeedEvent[]>(INITIAL);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setEvents(prev => [makeEvent(), ...prev.slice(0, 29)]);
      setCount(c => c + 1);
    }, 4500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="noctex-card flex flex-col" style={{ height: "100%", minHeight: 520 }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <span style={{ fontFamily: "var(--font-display)", fontSize: 11, letterSpacing: "0.15em", color: "var(--text-2)" }}>
          ACTIVITY
        </span>
        <div className="flex items-center gap-2">
          <span className="live-dot" />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-2)", letterSpacing: "0.1em" }}>
            LIVE
          </span>
        </div>
      </div>

      {/* Stats strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {[
          { label: "ORDERS",    value: (1024 + count * 3).toString() },
          { label: "MATCHED",   value: (441 + count).toString() },
          { label: "SETTLED",   value: (441 + count).toString() },
        ].map(({ label, value }) => (
          <div
            key={label}
            style={{
              padding: "8px 0",
              textAlign: "center",
              borderRight: "1px solid var(--border)",
              fontFamily: "var(--font-mono)",
            }}
          >
            <div style={{ fontSize: 14, color: "var(--accent)", fontWeight: 500 }}>{value}</div>
            <div style={{ fontSize: 8, color: "var(--text-3)", letterSpacing: "0.14em", marginTop: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Event list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {events.map((ev, i) => (
          <EventRow key={ev.id + ev.time} ev={ev} isLatest={i === 0} />
        ))}
      </div>

      {/* Footer */}
      <div style={{
        padding: "7px 14px",
        borderTop: "1px solid var(--border)",
        fontFamily: "var(--font-mono)",
        fontSize: 8,
        color: "var(--text-3)",
        letterSpacing: "0.1em",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <span>IKA dWALLET · 2PC-MPC · DEVNET</span>
        <span style={{ color: "var(--accent)", opacity: 0.4 }}>833YAgrb…</span>
      </div>
    </div>
  );
}
