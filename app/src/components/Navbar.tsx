'use client'

import Link from "next/link";
import { WalletButton } from "@/components/WalletButton";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const PAIRS = ["SOL/USDC", "ETH/USDC", "BTC/USDC"];

const NAV_LINKS = [
  { label: "Trade",     href: "/" },
  { label: "Portfolio", href: "/portfolio" },
  { label: "Docs",      href: "/docs" },
];

export function Navbar() {
  const pathname = usePathname();
  const [prices, setPrices] = useState({ SOL: 148.32, ETH: 2841.5, BTC: 67320 });

  useEffect(() => {
    const id = setInterval(() => {
      setPrices(p => ({
        SOL: +(p.SOL + (Math.random() - 0.5) * 0.4).toFixed(2),
        ETH: +(p.ETH + (Math.random() - 0.5) * 2.5).toFixed(1),
        BTC: +(p.BTC + (Math.random() - 0.5) * 40).toFixed(0),
      }));
    }, 2200);
    return () => clearInterval(id);
  }, []);

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50"
      style={{
        background: "rgba(0,0,0,0.94)",
        borderBottom: "1px solid rgba(0,255,136,0.08)",
        backdropFilter: "blur(12px)",
      }}
    >
      {/* Top ticker strip */}
      <div
        className="flex items-center gap-8 px-6 overflow-hidden"
        style={{
          height: 28,
          borderBottom: "1px solid rgba(0,255,136,0.05)",
          fontSize: 10,
          letterSpacing: "0.08em",
        }}
      >
        <span style={{ color: "var(--text-2)", fontFamily: "var(--font-mono)" }}>MARKET</span>
        {PAIRS.map((pair) => {
          const sym = pair.split("/")[0] as keyof typeof prices;
          return (
            <div key={pair} className="flex items-center gap-2" style={{ fontFamily: "var(--font-mono)" }}>
              <span style={{ color: "var(--text-2)" }}>{pair}</span>
              <span style={{ color: "var(--accent)", opacity: 0.9 }}>
                {prices[sym].toLocaleString()}
              </span>
              <span style={{ color: "var(--text-2)" }}>USDC</span>
            </div>
          );
        })}
        <div className="ml-auto flex items-center gap-2" style={{ color: "var(--text-2)", fontFamily: "var(--font-mono)" }}>
          <span className="live-dot" style={{ width: 5, height: 5 }} />
          <span>DEVNET LIVE</span>
        </div>
      </div>

      {/* Main nav row */}
      <div className="flex items-center justify-between px-6" style={{ height: 52 }}>
        {/* Logo */}
        <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 12 }}>
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <rect x="5" y="5" width="12" height="12" stroke="#00ff88" strokeWidth="1.2" transform="rotate(45 11 11)" />
            <rect x="8" y="8" width="6" height="6" fill="#00ff88" fillOpacity="0.15" transform="rotate(45 11 11)" />
          </svg>
          <div className="flex flex-col" style={{ gap: 0 }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, letterSpacing: "0.22em", color: "var(--accent)", lineHeight: 1 }}>
              NOCTEX
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.18em", color: "var(--text-2)", lineHeight: 1, marginTop: 2 }}>
              DARK POOL DEX
            </span>
          </div>
        </Link>

        {/* Center nav links */}
        <div className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map(({ label, href }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  textDecoration: "none",
                  padding: "6px 14px",
                  color: active ? "var(--accent)" : "var(--text-2)",
                  borderBottom: active ? "1px solid var(--accent)" : "1px solid transparent",
                  background: active ? "rgba(0,255,136,0.04)" : "transparent",
                  transition: "color 0.15s, border-color 0.15s, background 0.15s",
                }}
                onMouseEnter={e => {
                  if (!active) {
                    (e.currentTarget as HTMLElement).style.color = "var(--accent)";
                    (e.currentTarget as HTMLElement).style.borderBottomColor = "rgba(0,255,136,0.4)";
                  }
                }}
                onMouseLeave={e => {
                  if (!active) {
                    (e.currentTarget as HTMLElement).style.color = "var(--text-2)";
                    (e.currentTarget as HTMLElement).style.borderBottomColor = "transparent";
                  }
                }}
              >
                {label}
              </Link>
            );
          })}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2">
            {["FHE", "2PC-MPC", "LI.FI"].map(proto => (
              <span key={proto} style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                letterSpacing: "0.12em",
                color: "var(--accent)",
                border: "1px solid rgba(0,255,136,0.18)",
                padding: "2px 7px",
              }}>
                {proto}
              </span>
            ))}
          </div>

          <WalletButton />
        </div>
      </div>
    </nav>
  );
}
