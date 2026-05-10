"use client";

import { useState, useEffect, useRef } from "react";

type Level = { hash: string; price: number; size: number; depth: number };

function randomHash() {
  return Array.from({ length: 8 }, () =>
    Math.floor(Math.random() * 16).toString(16).toUpperCase()
  ).join("");
}

function generateLevels(base: number, count: number, dir: "bid" | "ask"): Level[] {
  let p = base;
  return Array.from({ length: count }, () => {
    if (dir === "bid") p -= Math.random() * 0.12 + 0.02;
    else p += Math.random() * 0.12 + 0.02;
    const size = Math.random() * 80 + 10;
    return { hash: randomHash(), price: +p.toFixed(4), size: +size.toFixed(2), depth: Math.random() };
  });
}

function useAnimatedValue(value: number, duration = 300) {
  const [display, setDisplay] = useState(value);
  const ref = useRef(value);
  useEffect(() => {
    const start = ref.current;
    const end = value;
    const startTime = performance.now();
    const frame = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      setDisplay(start + (end - start) * t);
      if (t < 1) requestAnimationFrame(frame);
      else ref.current = end;
    };
    requestAnimationFrame(frame);
  }, [value, duration]);
  return display;
}

function OrderRow({ level, side }: { level: Level; side: "bid" | "ask"; max: number }) {
  const isGreen = side === "bid";
  const accent = isGreen ? "#00ff88" : "#ff3d6b";
  const depthPct = (level.depth * 100).toFixed(0);

  return (
    <div
      className="flex items-center relative"
      style={{
        height: 26,
        padding: "0 12px",
        fontSize: 11,
        fontFamily: "var(--font-mono)",
        borderBottom: "1px solid rgba(255,255,255,0.02)",
        animation: "row-appear 0.25s ease forwards",
        cursor: "default",
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.background = isGreen
          ? "rgba(0,255,136,0.04)"
          : "rgba(255,61,107,0.04)";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.background = "transparent";
      }}
    >
      {/* Depth bar */}
      <div style={{
        position: "absolute",
        [side === "bid" ? "right" : "left"]: 0,
        top: 0, bottom: 0,
        width: `${depthPct}%`,
        background: isGreen ? "rgba(0,255,136,0.05)" : "rgba(255,61,107,0.05)",
        pointerEvents: "none",
      }} />

      {/* Hash */}
      <span style={{ color: "var(--text-2)", flex: "0 0 70px", fontSize: 9, letterSpacing: "0.05em" }}>
        {level.hash}
      </span>

      {/* Lock icon */}
      <span style={{ color: "var(--text-2)", fontSize: 8, marginRight: 6 }}>◈</span>

      {/* Price */}
      <span style={{ flex: 1, color: accent, fontWeight: 500, letterSpacing: "0.03em" }}>
        {level.price.toFixed(4)}
      </span>

      {/* Size — blurred for privacy */}
      <span style={{ color: "var(--text-2)", letterSpacing: "0.03em", filter: "blur(3px)" }}>
        {level.size.toFixed(2)}
      </span>
    </div>
  );
}

export function OrderBook() {
  const MID = 148.3200;
  const [bids, setBids] = useState<Level[]>([]);
  const [asks, setAsks] = useState<Level[]>([]);
  const [mid, setMid] = useState(MID);
  const animatedMid = useAnimatedValue(mid, 400);

  useEffect(() => {
    const init = () => {
      setMid(m => {
        const newMid = +(m + (Math.random() - 0.5) * 0.08).toFixed(4);
        setBids(generateLevels(newMid, 12, "bid"));
        setAsks(generateLevels(newMid, 12, "ask"));
        return newMid;
      });
    };
    init();
    const id = setInterval(init, 2800);
    return () => clearInterval(id);
  }, []);

  const spread = asks[0] && bids[0] ? (asks[0].price - bids[0].price).toFixed(4) : "—";

  return (
    <div className="noctex-card flex flex-col" style={{ height: "100%", minHeight: 520 }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <span style={{ fontFamily: "var(--font-display)", fontSize: 11, letterSpacing: "0.15em", color: "var(--text-2)" }}>
          ORDER BOOK
        </span>
        <div className="flex items-center gap-3" style={{ fontFamily: "var(--font-mono)", fontSize: 9 }}>
          <span style={{ color: "var(--text-3)", letterSpacing: "0.1em" }}>
            SPREAD <span style={{ color: "var(--text-2)", marginLeft: 4 }}>{spread}</span>
          </span>
          <span style={{ color: "var(--accent)", opacity: 0.4, letterSpacing: "0.08em" }}>◈ HIDDEN</span>
        </div>
      </div>

      {/* Column labels */}
      <div
        className="flex items-center px-3"
        style={{
          height: 22,
          borderBottom: "1px solid var(--border)",
          fontSize: 9,
          fontFamily: "var(--font-mono)",
          letterSpacing: "0.12em",
          color: "var(--text-2)",
        }}
      >
        <span style={{ flex: "0 0 70px" }}>ORDER ID</span>
        <span style={{ width: 14 }} />
        <span style={{ flex: 1 }}>PRICE</span>
        <span>SIZE</span>
      </div>

      {/* Asks (reversed — lowest at bottom) */}
      <div className="flex flex-col-reverse" style={{ flex: 1, overflowY: "auto" }}>
        {asks.map((a, i) => (
          <OrderRow key={`ask-${i}-${a.hash}`} level={a} side="ask" max={100} />
        ))}
      </div>

      {/* Mid price bar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        height: 38,
        background: "var(--surface-2)",
        borderTop: "1px solid var(--border)",
        borderBottom: "1px solid var(--border)",
      }}>
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: 18,
          fontWeight: 500,
          color: "var(--accent)",
          letterSpacing: "0.04em",
        }}>
          {animatedMid.toFixed(4)}
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-3)", letterSpacing: "0.1em" }}>
          USDC · MID
        </span>
      </div>

      {/* Bids */}
      <div className="flex flex-col" style={{ flex: 1, overflowY: "auto" }}>
        {bids.map((b, i) => (
          <OrderRow key={`bid-${i}-${b.hash}`} level={b} side="bid" max={100} />
        ))}
      </div>

      {/* Footer note */}
      <div style={{
        padding: "7px 12px",
        borderTop: "1px solid var(--border)",
        fontFamily: "var(--font-mono)",
        fontSize: 8,
        color: "var(--text-3)",
        letterSpacing: "0.1em",
        display: "flex",
        justifyContent: "space-between",
      }}>
        <span>ORDER SIZES HIDDEN BY FHE</span>
        <span>SOL / USDC</span>
      </div>
    </div>
  );
}
