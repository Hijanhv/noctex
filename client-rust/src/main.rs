//! Noctex Ika dWallet bootstrap (live, end-to-end).
//!
//! Two subcommands:
//!
//!   init <NOCTEX_PROGRAM_ID>
//!     Runs gRPC DKG against the Ika devnet (mock signer accepts placeholder
//!     bytes), polls for the dWallet PDA on-chain, and transfers authority
//!     from the payer to the Noctex program's CPI PDA. Persists the
//!     attestation + public key to .noctex-dwallet.json so `sign` can use it.
//!
//!   sign <APPROVE_TX_SIG> <BUY_ORDER> <SELL_ORDER>
//!     Reads .noctex-dwallet.json. Reconstructs the same settlement message
//!     that sign-settlement.ts used, derives the MessageApproval PDA, runs
//!     Presign + Sign via gRPC with `ApprovalProof::Solana { tx_sig, slot }`,
//!     and polls the on-chain MessageApproval until status flips to Signed.
//!
//! Adapted from chains/solana/examples/voting/e2e-rust at
//! github.com/dwallet-labs/ika-pre-alpha (mock-signer placeholder pattern,
//! seed packing helper, etc).

use std::env;
use std::str::FromStr;
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use solana_rpc_client::rpc_client::RpcClient;
use solana_sdk::commitment_config::CommitmentConfig;
use solana_sdk::instruction::{AccountMeta, Instruction};
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::{Keypair, Signature};
use solana_sdk::signer::Signer;
use solana_sdk::transaction::Transaction;

use ika_dwallet_types::*;
use ika_grpc::UserSignedRequest;
use ika_grpc::d_wallet_service_client::DWalletServiceClient;

const IKA_PROGRAM_ID: &str = "87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY";
const IX_TRANSFER_OWNERSHIP: u8 = 24;
const SEED_DWALLET: &[u8] = b"dwallet";
const SEED_MESSAGE_APPROVAL: &[u8] = b"message_approval";
const SEED_CPI_AUTHORITY: &[u8] = b"__ika_cpi_authority";
const CURVE_CURVE25519_U16: u16 = 2;
const SIG_EDDSA_SHA_512_U16: u16 = 5;
const DEFAULT_GRPC: &str = "https://pre-alpha-dev-1.ika.ika-network.net:443";
const DEFAULT_RPC: &str = "https://api.devnet.solana.com";

const MA_DISC: u8 = 14;
const MA_STATUS: usize = 172;
const MA_STATUS_SIGNED: u8 = 1;
const MA_SIGNATURE_LEN: usize = 173;
const MA_SIGNATURE: usize = 175;

const STATE_FILE: &str = ".noctex-dwallet.json";

const BOLD: &str = "\x1b[1m";
const RESET: &str = "\x1b[0m";
const CYAN: &str = "\x1b[36m";
const GREEN: &str = "\x1b[32m";
const YELLOW: &str = "\x1b[33m";

fn step(s: &str, m: &str) {
    println!("{CYAN}[{s}]{RESET} {m}");
}
fn ok(m: &str) {
    println!("{GREEN}  \u{2713}{RESET} {m}");
}
fn val(label: &str, v: impl std::fmt::Display) {
    println!("{YELLOW}  \u{2192}{RESET} {label}: {v}");
}

#[derive(Serialize, Deserialize)]
struct PersistedState {
    dwallet_pda: String,
    public_key_hex: String,
    attestation_data_hex: String,
    noctex_program_id: String,
    cpi_authority: String,
    curve: u16,
    scheme: u16,
}

fn state_path() -> String {
    env::var("NOCTEX_DWALLET_STATE").unwrap_or_else(|_| STATE_FILE.to_string())
}

fn load_state() -> PersistedState {
    let data = std::fs::read_to_string(state_path())
        .unwrap_or_else(|_| panic!("Cannot read {} — run `init` first", state_path()));
    serde_json::from_str(&data).expect("invalid state JSON")
}

fn save_state(s: &PersistedState) {
    std::fs::write(state_path(), serde_json::to_string_pretty(s).unwrap())
        .expect("write state");
}

fn load_payer() -> Keypair {
    let path = env::var("PAYER_KEYPAIR").unwrap_or_else(|_| {
        format!(
            "{}/.config/solana/id.json",
            env::var("HOME").unwrap_or_default()
        )
    });
    let raw = std::fs::read_to_string(&path)
        .unwrap_or_else(|_| panic!("Cannot read keypair at {path}"));
    let s = raw.trim();
    let bytes: Vec<u8> = s[1..s.len() - 1]
        .split(',')
        .map(|v| v.trim().parse::<u8>().unwrap())
        .collect();
    #[allow(deprecated)]
    Keypair::from_bytes(&bytes).expect("valid keypair")
}

fn pack_dwallet_seed_payload(curve: u16, public_key: &[u8]) -> Vec<u8> {
    let mut buf = Vec::with_capacity(2 + public_key.len());
    buf.extend_from_slice(&curve.to_le_bytes());
    buf.extend_from_slice(public_key);
    buf
}

fn build_grpc_request(payer: &Keypair, request: SignedRequestData) -> UserSignedRequest {
    let signed_request_data = bcs::to_bytes(&request).expect("BCS encode SignedRequestData");
    let user_sig = UserSignature::Ed25519 {
        signature: vec![0u8; 64],
        public_key: payer.pubkey().to_bytes().to_vec(),
    };
    UserSignedRequest {
        user_signature: bcs::to_bytes(&user_sig).expect("BCS encode UserSignature"),
        signed_request_data,
    }
}

fn poll_until(
    client: &RpcClient,
    account: &Pubkey,
    check: impl Fn(&[u8]) -> bool,
    timeout: Duration,
) -> Vec<u8> {
    let started = Instant::now();
    loop {
        if started.elapsed() > timeout {
            panic!("timeout waiting for {account}");
        }
        if let Ok(acct) = client.get_account(account) {
            if check(&acct.data) {
                return acct.data;
            }
        }
        thread::sleep(Duration::from_millis(500));
    }
}

async fn make_grpc(grpc_url: &str) -> DWalletServiceClient<tonic::transport::Channel> {
    if grpc_url.starts_with("https") {
        let tls = tonic::transport::ClientTlsConfig::new().with_native_roots();
        let channel = tonic::transport::Channel::from_shared(grpc_url.to_string())
            .expect("valid gRPC URL")
            .tls_config(tls)
            .expect("tls config")
            .connect()
            .await
            .expect("connect to Ika gRPC");
        DWalletServiceClient::new(channel)
    } else {
        DWalletServiceClient::connect(grpc_url.to_string())
            .await
            .expect("connect to Ika gRPC")
    }
}

// ───────────────────────────────────────────────────────────────────────────
// init subcommand: DKG + transfer authority + persist state
// ───────────────────────────────────────────────────────────────────────────

async fn run_init(args: &[String]) {
    if args.len() < 3 {
        eprintln!("Usage: noctex-ika-bootstrap init <NOCTEX_PROGRAM_ID>");
        std::process::exit(1);
    }
    let noctex_program_id = Pubkey::from_str(&args[2]).expect("invalid NOCTEX_PROGRAM_ID");
    let dwallet_program_id = Pubkey::from_str(IKA_PROGRAM_ID).unwrap();
    let grpc_url = env::var("GRPC_URL").unwrap_or_else(|_| DEFAULT_GRPC.into());
    let rpc_url = env::var("RPC_URL").unwrap_or_else(|_| DEFAULT_RPC.into());

    println!();
    println!("{BOLD}\u{2550}\u{2550}\u{2550} Noctex Ika dWallet bootstrap — INIT \u{2550}\u{2550}\u{2550}{RESET}");
    println!();
    val("Noctex program", noctex_program_id);
    val("Ika dWallet program", dwallet_program_id);
    val("gRPC endpoint", &grpc_url);

    let client = RpcClient::new_with_commitment(rpc_url, CommitmentConfig::confirmed());
    let payer = load_payer();
    let bal = client.get_balance(&payer.pubkey()).unwrap_or(0);
    val("Payer", payer.pubkey());
    val("Balance", format!("{:.4} SOL", bal as f64 / 1e9));
    println!();

    step("1/2", "Connecting to Ika gRPC and requesting DKG...");
    let mut grpc = make_grpc(&grpc_url).await;

    let dkg_preimage: [u8; 32] = Keypair::new().pubkey().to_bytes();
    let dkg_request = build_grpc_request(
        &payer,
        SignedRequestData {
            session_identifier_preimage: dkg_preimage,
            epoch: 1,
            chain_id: ChainId::Solana,
            intended_chain_sender: payer.pubkey().to_bytes().to_vec(),
            request: DWalletRequest::DKG {
                dwallet_network_encryption_public_key: vec![0u8; 32],
                curve: DWalletCurve::Curve25519,
                centralized_public_key_share_and_proof: vec![0u8; 32],
                user_secret_key_share: UserSecretKeyShare::Encrypted {
                    encrypted_centralized_secret_share_and_proof: vec![0u8; 32],
                    encryption_key: vec![0u8; 32],
                    signer_public_key: payer.pubkey().to_bytes().to_vec(),
                },
                user_public_output: vec![0u8; 32],
                sign_during_dkg_request: None,
            },
        },
    );

    let response = grpc
        .submit_transaction(dkg_request)
        .await
        .expect("submit DKG");
    let response_data: TransactionResponseData =
        bcs::from_bytes(&response.into_inner().response_data).expect("decode response");
    let attestation = match response_data {
        TransactionResponseData::Attestation(att) => att,
        other => panic!("unexpected DKG response variant: {other:?}"),
    };
    let attestation_bytes = bcs::to_bytes(&attestation).expect("re-serialize attestation");
    let versioned: VersionedDWalletDataAttestation =
        bcs::from_bytes(&attestation.attestation_data).expect("decode attestation");
    let VersionedDWalletDataAttestation::V1(data) = versioned;
    let public_key = data.public_key;
    ok("DKG complete (mock signer)");
    val("dWallet public key", hex::encode(&public_key));

    let payload = pack_dwallet_seed_payload(CURVE_CURVE25519_U16, &public_key);
    let mut seeds: Vec<&[u8]> = vec![SEED_DWALLET];
    for chunk in payload.chunks(32) {
        seeds.push(chunk);
    }
    let (dwallet_pda, _) = Pubkey::find_program_address(&seeds, &dwallet_program_id);
    val("dWallet PDA", dwallet_pda);

    step("1/2", "Waiting for the mock to commit the dWallet on-chain...");
    poll_until(
        &client,
        &dwallet_pda,
        |d| d.len() > 2 && d[0] == 2,
        Duration::from_secs(45),
    );
    ok("dWallet account committed");
    println!();

    let (cpi_authority, _bump) =
        Pubkey::find_program_address(&[SEED_CPI_AUTHORITY], &noctex_program_id);
    step(
        "2/2",
        &format!("Transferring dWallet authority to Noctex CPI PDA {cpi_authority}..."),
    );

    let mut transfer_data = Vec::with_capacity(33);
    transfer_data.push(IX_TRANSFER_OWNERSHIP);
    transfer_data.extend_from_slice(cpi_authority.as_ref());

    let blockhash = client.get_latest_blockhash().expect("blockhash");
    let ix = Instruction::new_with_bytes(
        dwallet_program_id,
        &transfer_data,
        vec![
            AccountMeta::new_readonly(payer.pubkey(), true),
            AccountMeta::new(dwallet_pda, false),
        ],
    );
    let tx = Transaction::new_signed_with_payer(&[ix], Some(&payer.pubkey()), &[&payer], blockhash);
    let sig = client
        .send_and_confirm_transaction(&tx)
        .expect("transfer_dwallet");
    ok(&format!("Authority transferred. TX: {sig}"));
    println!();

    let state = PersistedState {
        dwallet_pda: dwallet_pda.to_string(),
        public_key_hex: hex::encode(&public_key),
        attestation_data_hex: hex::encode(&attestation_bytes),
        noctex_program_id: noctex_program_id.to_string(),
        cpi_authority: cpi_authority.to_string(),
        curve: CURVE_CURVE25519_U16,
        scheme: SIG_EDDSA_SHA_512_U16,
    };
    save_state(&state);
    ok(&format!("State persisted to {}", state_path()));
    println!();

    println!("{BOLD}\u{2550}\u{2550}\u{2550} INIT complete \u{2550}\u{2550}\u{2550}{RESET}\n");
    println!("Next:");
    println!(
        "  cd ../client && bun run src/update-dwallet.ts {dwallet_pda}\n  bun run src/sign-settlement.ts <BUY> <SELL> {}\n  cd ../client-rust && ./target/release/noctex-ika-bootstrap sign <APPROVE_TX_SIG> <BUY> <SELL>",
        hex::encode(&public_key)
    );
}

// ───────────────────────────────────────────────────────────────────────────
// sign subcommand: Presign + Sign + verify status=Signed
// ───────────────────────────────────────────────────────────────────────────

async fn run_sign(args: &[String]) {
    if args.len() < 5 {
        eprintln!("Usage: noctex-ika-bootstrap sign <APPROVE_TX_SIG> <BUY_ORDER> <SELL_ORDER>");
        std::process::exit(1);
    }
    let approve_tx_sig = Signature::from_str(&args[2]).expect("invalid TX signature");
    let buy_order = Pubkey::from_str(&args[3]).expect("invalid BUY_ORDER");
    let sell_order = Pubkey::from_str(&args[4]).expect("invalid SELL_ORDER");

    let state = load_state();
    let dwallet_program_id = Pubkey::from_str(IKA_PROGRAM_ID).unwrap();
    let public_key = hex::decode(&state.public_key_hex).expect("hex pubkey");
    let attestation_bytes = hex::decode(&state.attestation_data_hex).expect("hex attestation");
    let attestation: NetworkSignedAttestation =
        bcs::from_bytes(&attestation_bytes).expect("decode attestation");
    // The mock stores the signing key under the DKG attestation's
    // session_identifier — NOT the dwallet PDA. Use it as the
    // session_identifier_preimage for Presign + Sign so the mock can find
    // the key. (voting/e2e-rust:339)
    let versioned: VersionedDWalletDataAttestation =
        bcs::from_bytes(&attestation.attestation_data).expect("decode versioned");
    let VersionedDWalletDataAttestation::V1(att_data) = versioned;
    let session_identifier: [u8; 32] = att_data.session_identifier;
    let dwallet_pda = Pubkey::from_str(&state.dwallet_pda).unwrap();

    let grpc_url = env::var("GRPC_URL").unwrap_or_else(|_| DEFAULT_GRPC.into());
    let rpc_url = env::var("RPC_URL").unwrap_or_else(|_| DEFAULT_RPC.into());
    let client = RpcClient::new_with_commitment(rpc_url, CommitmentConfig::confirmed());
    let payer = load_payer();

    println!();
    println!("{BOLD}\u{2550}\u{2550}\u{2550} Noctex Ika sign — PRESIGN + SIGN \u{2550}\u{2550}\u{2550}{RESET}");
    println!();
    val("dWallet PDA", &state.dwallet_pda);
    val("dWallet pubkey", &state.public_key_hex);
    val("Buy order", buy_order);
    val("Sell order", sell_order);
    val("Approve TX", approve_tx_sig);

    // Fetch the slot of the approve_message TX for ApprovalProof::Solana.
    step("0/3", "Fetching approve_message TX slot...");
    let tx = client
        .get_transaction(
            &approve_tx_sig,
            solana_transaction_status_client_types::UiTransactionEncoding::Base64,
        )
        .expect("get_transaction");
    let approve_slot = tx.slot;
    val("Approve slot", approve_slot);

    // Reconstruct the same message that sign-settlement.ts used.
    let message = format!(
        "noctex-settlement-v0|{}|{}",
        buy_order, sell_order
    )
    .into_bytes();
    // Ika hashes with keccak256 server-side (voting/e2e-rust:404). We must
    // match so the MessageApproval PDA derived client-side equals what Ika
    // looks up at Sign time.
    let message_digest: [u8; 32] = solana_sdk::keccak::hash(&message).to_bytes();
    val("Message digest", hex::encode(message_digest));

    // Derive MessageApproval PDA — same seeds as sign-settlement.ts.
    let scheme_bytes = SIG_EDDSA_SHA_512_U16.to_le_bytes();
    let payload = pack_dwallet_seed_payload(state.curve, &public_key);
    let mut ma_seeds: Vec<&[u8]> = vec![SEED_DWALLET];
    for chunk in payload.chunks(32) {
        ma_seeds.push(chunk);
    }
    ma_seeds.push(SEED_MESSAGE_APPROVAL);
    ma_seeds.push(&scheme_bytes);
    ma_seeds.push(&message_digest);
    let (message_approval_pda, _) = Pubkey::find_program_address(&ma_seeds, &dwallet_program_id);
    val("MessageApproval PDA", message_approval_pda);

    let ma_pending = poll_until(
        &client,
        &message_approval_pda,
        |d| d.len() > MA_STATUS && d[0] == MA_DISC,
        Duration::from_secs(15),
    );
    if ma_pending[MA_STATUS] == MA_STATUS_SIGNED {
        ok("MessageApproval already Signed (skipping Presign + Sign)");
        let sig_len = u16::from_le_bytes(
            ma_pending[MA_SIGNATURE_LEN..MA_SIGNATURE_LEN + 2]
                .try_into()
                .unwrap(),
        ) as usize;
        let on_chain_sig = &ma_pending[MA_SIGNATURE..MA_SIGNATURE + sig_len];
        val("On-chain signature", hex::encode(on_chain_sig));
        return;
    }
    ok("MessageApproval found, status=Pending");
    println!();

    // ── Presign ────────────────────────────────────────────────────────
    step("1/3", "Allocating presign via gRPC...");
    let mut grpc = make_grpc(&grpc_url).await;
    let presign_request = build_grpc_request(
        &payer,
        SignedRequestData {
            session_identifier_preimage: session_identifier,
            epoch: 1,
            chain_id: ChainId::Solana,
            intended_chain_sender: payer.pubkey().to_bytes().to_vec(),
            request: DWalletRequest::Presign {
                dwallet_network_encryption_public_key: vec![0u8; 32],
                curve: DWalletCurve::Curve25519,
                signature_algorithm: DWalletSignatureAlgorithm::EdDSA,
            },
        },
    );

    let presign_resp: TransactionResponseData = bcs::from_bytes(
        &grpc
            .submit_transaction(presign_request)
            .await
            .expect("presign")
            .into_inner()
            .response_data,
    )
    .expect("BCS");
    let presign_id = match presign_resp {
        TransactionResponseData::Attestation(att) => {
            let v: VersionedPresignDataAttestation =
                bcs::from_bytes(&att.attestation_data).expect("decode presign");
            let VersionedPresignDataAttestation::V1(d) = v;
            d.presign_session_identifier
        }
        other => panic!("unexpected presign response: {other:?}"),
    };
    ok("Presign allocated");
    val("Presign ID", hex::encode(&presign_id));
    println!();

    // ── Sign ──────────────────────────────────────────────────────────
    step("2/3", "Sending Sign request via gRPC...");
    let sign_request = build_grpc_request(
        &payer,
        SignedRequestData {
            session_identifier_preimage: session_identifier,
            epoch: 1,
            chain_id: ChainId::Solana,
            intended_chain_sender: payer.pubkey().to_bytes().to_vec(),
            request: DWalletRequest::Sign {
                message: message.clone(),
                message_metadata: vec![],
                presign_session_identifier: presign_id,
                message_centralized_signature: vec![0u8; 64],
                dwallet_attestation: attestation.clone(),
                approval_proof: ApprovalProof::Solana {
                    transaction_signature: approve_tx_sig.as_ref().to_vec(),
                    slot: approve_slot,
                },
            },
        },
    );
    let sign_resp: TransactionResponseData = bcs::from_bytes(
        &grpc
            .submit_transaction(sign_request)
            .await
            .expect("sign")
            .into_inner()
            .response_data,
    )
    .expect("BCS");
    let grpc_signature = match sign_resp {
        TransactionResponseData::Signature { signature } => signature,
        TransactionResponseData::Error { message } => panic!("gRPC Sign error: {message}"),
        other => panic!("unexpected sign response: {other:?}"),
    };
    ok(&format!("Signature received ({} bytes)", grpc_signature.len()));
    val("Signature", hex::encode(&grpc_signature));
    println!();

    // ── Verify on-chain ───────────────────────────────────────────────
    step("3/3", "Verifying signature committed on-chain...");
    let ma_signed = poll_until(
        &client,
        &message_approval_pda,
        |d| d.len() > MA_STATUS && d[MA_STATUS] == MA_STATUS_SIGNED,
        Duration::from_secs(20),
    );
    let on_chain_len = u16::from_le_bytes(
        ma_signed[MA_SIGNATURE_LEN..MA_SIGNATURE_LEN + 2]
            .try_into()
            .unwrap(),
    ) as usize;
    let on_chain_sig = &ma_signed[MA_SIGNATURE..MA_SIGNATURE + on_chain_len];
    assert_eq!(
        on_chain_sig,
        grpc_signature.as_slice(),
        "on-chain != gRPC signature"
    );
    ok("Signature committed on-chain — status=Signed");
    val("On-chain sig", hex::encode(on_chain_sig));
    println!();
    println!(
        "{BOLD}{GREEN}\u{2550}\u{2550}\u{2550} Live Ika 2PC-MPC signing END-TO-END complete \u{2550}\u{2550}\u{2550}{RESET}\n"
    );
}

#[tokio::main]
async fn main() {
    let args: Vec<String> = env::args().collect();
    match args.get(1).map(|s| s.as_str()) {
        Some("init") => run_init(&args).await,
        Some("sign") => run_sign(&args).await,
        _ => {
            eprintln!(
                "Usage:\n  noctex-ika-bootstrap init <NOCTEX_PROGRAM_ID>\n  noctex-ika-bootstrap sign <APPROVE_TX_SIG> <BUY_ORDER> <SELL_ORDER>"
            );
            std::process::exit(1);
        }
    }
}
