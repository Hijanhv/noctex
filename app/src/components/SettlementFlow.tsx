"use client";

import { useCallback, useState } from "react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { keccak_256 } from "@noble/hashes/sha3";
import {
  createEncryptWebClient,
  Chain,
} from "@encrypt.xyz/pre-alpha-solana-client/grpc-web";

import {
  ENCRYPT_GRPC_WEB,
  ENCRYPT_PROGRAM_ID,
  FHE_TYPE_EUINT64,
  IKA_PROGRAM_ID,
  NOCTEX_PROGRAM_ID,
  PRE_ALPHA_NETWORK_KEY,
  deriveDWalletConfigPda,
  deriveEncryptConfigPda,
  deriveEncryptCpiAuthorityPda,
  deriveEncryptDepositPda,
  deriveEncryptEventAuthorityPda,
  deriveEncryptNetworkKeyPda,
  explorerTx,
  getConnection,
  getProgramWithPhantom,
  mockCiphertextBytes,
} from "@/lib/noctex-client";

const CURVE_CURVE25519 = 2;
const SIG_EDDSA_SHA_512 = 5;
const MA_STATUS_OFFSET = 172;
const MA_SIG_LEN_OFFSET = 173;
const MA_SIG_OFFSET = 175;

type StepStatus = "idle" | "running" | "done" | "error";
type StepKey = "match" | "settle" | "sign" | "finalize";

interface StepState {
  status: StepStatus;
  tx?: string;
  message?: string;
}

function deriveCoordinatorPda(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("dwallet_coordinator")],
    IKA_PROGRAM_ID,
  )[0];
}

function deriveDwalletAccountPda(
  curve: number,
  publicKey: Uint8Array,
): PublicKey {
  const payload = Buffer.alloc(2 + publicKey.length);
  payload.writeUInt16LE(curve, 0);
  payload.set(publicKey, 2);
  const chunks: Buffer[] = [];
  for (let i = 0; i < payload.length; i += 32) {
    chunks.push(payload.subarray(i, Math.min(i + 32, payload.length)));
  }
  return PublicKey.findProgramAddressSync(
    [Buffer.from("dwallet"), ...chunks],
    IKA_PROGRAM_ID,
  )[0];
}

function deriveMessageApprovalPda(
  curve: number,
  dwalletPublicKey: Uint8Array,
  scheme: number,
  messageDigest: Uint8Array,
): [PublicKey, number] {
  const payload = Buffer.alloc(2 + dwalletPublicKey.length);
  payload.writeUInt16LE(curve, 0);
  payload.set(dwalletPublicKey, 2);
  const chunks: Buffer[] = [];
  for (let i = 0; i < payload.length; i += 32) {
    chunks.push(payload.subarray(i, Math.min(i + 32, payload.length)));
  }
  const schemeBuf = Buffer.alloc(2);
  schemeBuf.writeUInt16LE(scheme);
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("dwallet"),
      ...chunks,
      Buffer.from("message_approval"),
      schemeBuf,
      Buffer.from(messageDigest),
    ],
    IKA_PROGRAM_ID,
  );
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, "");
  if (clean.length !== 64) throw new Error("dWallet pubkey must be 64 hex chars (32 bytes)");
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// dWallet from `.noctex-dwallet.json` — the only dWallet ever bootstrapped
// against our program. In production this would be configurable per-user.
const DEFAULT_DWALLET_PUBKEY_HEX =
  "c7b1ebf25dbfae955ff619239ee0c72ef63757c43d798d0020a463e227c31fc3";

export function SettlementFlow() {
  const [buyArg, setBuyArg] = useState("");
  const [sellArg, setSellArg] = useState("");
  const [steps, setSteps] = useState<Record<StepKey, StepState>>({
    match: { status: "idle" },
    settle: { status: "idle" },
    sign: { status: "idle" },
    finalize: { status: "idle" },
  });
  const [messageApprovalAddr, setMessageApprovalAddr] = useState<string | null>(null);

  const setStep = (k: StepKey, s: StepState) =>
    setSteps((prev) => ({ ...prev, [k]: s }));

  const runMatch = useCallback(async () => {
    if (!buyArg || !sellArg) return;
    setStep("match", { status: "running" });
    try {
      const { program, publicKey } = await getProgramWithPhantom();
      const buyOrder = new PublicKey(buyArg.trim());
      const sellOrder = new PublicKey(sellArg.trim());
      const [buy, sell] = await Promise.all([
        program.account.order.fetch(buyOrder),
        program.account.order.fetch(sellOrder),
      ]);

      const encrypt = createEncryptWebClient(ENCRYPT_GRPC_WEB);
      const zero = mockCiphertextBytes(0n, FHE_TYPE_EUINT64);
      const ids = await encrypt.createInput({
        chain: Chain.SOLANA,
        inputs: [
          { ciphertextBytes: zero, fheType: FHE_TYPE_EUINT64 },
          { ciphertextBytes: zero, fheType: FHE_TYPE_EUINT64 },
          { ciphertextBytes: zero, fheType: FHE_TYPE_EUINT64 },
        ],
        authorized: NOCTEX_PROGRAM_ID.toBytes(),
        networkEncryptionPublicKey: PRE_ALPHA_NETWORK_KEY,
      });
      const [fillBuyerCt, fillSellerCt, execPriceCt] = ids.map(
        (b) => new PublicKey(b),
      );

      const [encryptConfig] = deriveEncryptConfigPda();
      const [encryptEventAuthority] = deriveEncryptEventAuthorityPda();
      const [encryptDeposit] = deriveEncryptDepositPda(publicKey);
      const [encryptNetworkKey] = deriveEncryptNetworkKeyPda();
      const [encryptCpiAuthority, cpiBump] = deriveEncryptCpiAuthorityPda();

      const tx = await program.methods
        .executeMatch(cpiBump)
        .accountsPartial({
          buyOrder,
          sellOrder,
          buyPriceCt: buy.encryptedPrice,
          sellPriceCt: sell.encryptedPrice,
          buyAmountCt: buy.encryptedAmount,
          sellAmountCt: sell.encryptedAmount,
          fillBuyerCt,
          fillSellerCt,
          execPriceCt,
          encryptProgram: ENCRYPT_PROGRAM_ID,
          encryptConfig,
          encryptDeposit,
          encryptCpiAuthority,
          callerProgram: program.programId,
          networkEncryptionKey: encryptNetworkKey,
          encryptEventAuthority,
          payer: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setStep("match", { status: "done", tx });
    } catch (e: unknown) {
      setStep("match", {
        status: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, [buyArg, sellArg]);

  const runSettle = useCallback(async () => {
    if (!buyArg || !sellArg) return;
    setStep("settle", { status: "running" });
    try {
      const { program, publicKey } = await getProgramWithPhantom();
      const tx = await program.methods
        .settleMatch()
        .accountsPartial({
          buyOrder: new PublicKey(buyArg.trim()),
          sellOrder: new PublicKey(sellArg.trim()),
          authority: publicKey,
        })
        .rpc();
      setStep("settle", { status: "done", tx });
    } catch (e: unknown) {
      setStep("settle", {
        status: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, [buyArg, sellArg]);

  const runSign = useCallback(async () => {
    if (!buyArg || !sellArg) return;
    setStep("sign", { status: "running" });
    try {
      const { program, publicKey } = await getProgramWithPhantom();
      const buyOrder = new PublicKey(buyArg.trim());
      const sellOrder = new PublicKey(sellArg.trim());

      const dwalletPubkey = hexToBytes(DEFAULT_DWALLET_PUBKEY_HEX);
      const dwallet = deriveDwalletAccountPda(CURVE_CURVE25519, dwalletPubkey);
      const coordinator = deriveCoordinatorPda();
      const [dwalletConfig] = deriveDWalletConfigPda();

      // Settlement digest = keccak256("noctex-settlement-v0|<buy>|<sell>")
      const messageBytes = new TextEncoder().encode(
        `noctex-settlement-v0|${buyOrder.toBase58()}|${sellOrder.toBase58()}`,
      );
      const messageDigest = keccak_256(messageBytes);
      const metadataDigest = new Uint8Array(32);

      const [messageApproval, maBump] = deriveMessageApprovalPda(
        CURVE_CURVE25519,
        dwalletPubkey,
        SIG_EDDSA_SHA_512,
        messageDigest,
      );

      const tx = await program.methods
        .signSettlement(
          maBump,
          Array.from(messageDigest),
          Array.from(metadataDigest),
          publicKey,
          SIG_EDDSA_SHA_512,
        )
        .accountsPartial({
          dwalletConfig,
          buyOrder,
          sellOrder,
          coordinator,
          messageApproval,
          dwallet,
          callerProgram: program.programId,
          cpiAuthority: PublicKey.findProgramAddressSync(
            [Buffer.from("__ika_cpi_authority")],
            program.programId,
          )[0],
          payer: publicKey,
          systemProgram: SystemProgram.programId,
          ikaProgram: IKA_PROGRAM_ID,
        })
        .rpc();

      setMessageApprovalAddr(messageApproval.toBase58());
      setStep("sign", { status: "done", tx });
    } catch (e: unknown) {
      setStep("sign", {
        status: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, [buyArg, sellArg]);

  const runFinalize = useCallback(async () => {
    if (!buyArg || !sellArg || !messageApprovalAddr) return;
    setStep("finalize", { status: "running" });
    try {
      const { program, publicKey } = await getProgramWithPhantom();
      const messageApproval = new PublicKey(messageApprovalAddr);

      // Poll until Ika network commits the signature (status=Signed at byte 172).
      const connection = getConnection();
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        const info = await connection.getAccountInfo(messageApproval, "confirmed");
        if (info && info.data.length > MA_SIG_OFFSET) {
          const d = info.data as Buffer;
          if (d[MA_STATUS_OFFSET] === 1 && d.readUInt16LE(MA_SIG_LEN_OFFSET) > 0) break;
        }
        await new Promise((r) => setTimeout(r, 1500));
      }

      const tx = await program.methods
        .finalizeSettlement()
        .accountsPartial({
          buyOrder: new PublicKey(buyArg.trim()),
          sellOrder: new PublicKey(sellArg.trim()),
          messageApproval,
          authority: publicKey,
        })
        .rpc();

      setStep("finalize", { status: "done", tx });
    } catch (e: unknown) {
      setStep("finalize", {
        status: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, [buyArg, sellArg, messageApprovalAddr]);

  return (
    <div className="noctex-card flex flex-col" style={{ height: "100%", minHeight: 520 }}>
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 11,
            letterSpacing: "0.15em",
            color: "var(--text-2)",
          }}
        >
          SETTLEMENT FLOW
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--accent)",
            opacity: 0.55,
            letterSpacing: "0.06em",
          }}
        >
          MATCH → SETTLE → SIGN → FINALIZE
        </span>
      </div>

      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        <Field label="Buy Order PDA" value={buyArg} onChange={setBuyArg} placeholder="Paste from PLACE BUY result" />
        <Field label="Sell Order PDA" value={sellArg} onChange={setSellArg} placeholder="Paste from PLACE SELL result" />

        <StepRow
          n="1"
          label="EXECUTE_MATCH"
          sub="Pre-allocates 3 output ciphertexts via Encrypt gRPC, runs match_orders graph CPI."
          state={steps.match}
          onClick={runMatch}
          disabled={!buyArg || !sellArg || steps.match.status === "running"}
        />
        <StepRow
          n="2"
          label="SETTLE_MATCH"
          sub="Transitions both Orders to Settled."
          state={steps.settle}
          onClick={runSettle}
          disabled={steps.match.status !== "done" || steps.settle.status === "running"}
        />
        <StepRow
          n="3"
          label="SIGN_SETTLEMENT"
          sub="CPIs Ika approve_message — creates MessageApproval PDA in Pending."
          state={steps.sign}
          onClick={runSign}
          disabled={steps.settle.status !== "done" || steps.sign.status === "running"}
        />
        {steps.sign.status === "done" && (
          <div
            style={{
              background: "var(--surface-2)",
              border: "1px solid rgba(255,200,0,0.25)",
              padding: "10px 12px",
              fontFamily: "var(--font-mono)",
              fontSize: 9.5,
              color: "#ffce4e",
              letterSpacing: "0.05em",
              lineHeight: 1.6,
            }}
          >
            ⚠ The Ika network needs to commit a signature on the MessageApproval account.
            Pre-alpha requires running this in your terminal:
            <div
              style={{
                marginTop: 6,
                padding: "8px 10px",
                background: "#000",
                border: "1px solid rgba(255,200,0,0.15)",
                color: "#ffce4e",
                wordBreak: "break-all",
                fontSize: 9,
              }}
            >
              cd noctex/client-rust && ./target/release/noctex-ika-bootstrap sign {steps.sign.tx} {buyArg} {sellArg}
            </div>
          </div>
        )}
        <StepRow
          n="4"
          label="FINALIZE_SETTLEMENT"
          sub="Polls MessageApproval, verifies status=Signed + sig_len>0, advances to Finalized."
          state={steps.finalize}
          onClick={runFinalize}
          disabled={steps.sign.status !== "done" || steps.finalize.status === "running"}
        />
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          letterSpacing: "0.14em",
          color: "var(--text-2)",
          textTransform: "uppercase",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <input
        spellCheck={false}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          padding: "8px 10px",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--accent)",
          outline: "none",
        }}
      />
    </div>
  );
}

function StepRow({
  n,
  label,
  sub,
  state,
  onClick,
  disabled,
}: {
  n: string;
  label: string;
  sub: string;
  state: StepState;
  onClick: () => void;
  disabled: boolean;
}) {
  const color =
    state.status === "done"
      ? "var(--accent)"
      : state.status === "error"
        ? "var(--sell)"
        : state.status === "running"
          ? "#ffce4e"
          : "var(--text-3)";
  return (
    <div
      style={{
        border: `1px solid ${state.status === "done" ? "rgba(0,255,136,0.25)" : "var(--border)"}`,
        padding: "10px 12px",
        background:
          state.status === "done" ? "rgba(0,255,136,0.04)" : "var(--surface-2)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 22,
            height: 22,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: state.status === "done" ? "rgba(0,255,136,0.15)" : "transparent",
            border: `1px solid ${color}`,
            color,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {state.status === "done" ? "✓" : state.status === "error" ? "✗" : n}
        </div>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.16em",
              color,
            }}
          >
            {label}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-3)", lineHeight: 1.5 }}>
            {sub}
          </div>
        </div>
        <button
          onClick={onClick}
          disabled={disabled}
          style={{
            padding: "7px 14px",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            background: disabled ? "transparent" : "rgba(0,255,136,0.10)",
            color: disabled ? "var(--text-3)" : "var(--accent)",
            border: `1px solid ${disabled ? "var(--border)" : "var(--accent)"}`,
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.4 : 1,
          }}
        >
          {state.status === "running" ? "RUNNING…" : "RUN"}
        </button>
      </div>
      {state.tx && (
        <a
          href={explorerTx(state.tx)}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "block",
            marginTop: 8,
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--accent)",
            opacity: 0.7,
            textDecoration: "none",
            wordBreak: "break-all",
          }}
        >
          TX {state.tx.slice(0, 16)}… →
        </a>
      )}
      {state.message && (
        <div
          style={{
            marginTop: 8,
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--sell)",
            wordBreak: "break-word",
            lineHeight: 1.5,
          }}
        >
          {state.message}
        </div>
      )}
    </div>
  );
}
