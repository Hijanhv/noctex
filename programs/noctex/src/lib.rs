use anchor_lang::prelude::*;

pub mod order;
pub mod fhe;
pub mod dwallet;

use order::*;
use fhe::*;
use dwallet::*;

declare_id!("833YAgrbapXnLiYkUq6tG6hWfZ7whX34Xs7CtBN8Nrvx");

/// Encrypt program on Solana devnet (FHE executor commits ciphertexts here).
pub const ENCRYPT_PROGRAM_ID: Pubkey = pubkey!("4ebfzWdKnrnGseuQpezXdG8yCdHqwQ1SSBHD3bWArND8");

#[program]
pub mod noctex {
    use super::*;

    /// Submit an encrypted order to the dark pool.
    /// `encrypted_price` and `encrypted_amount` are pubkeys of CiphertextAccounts
    /// created by the client (via the Encrypt gRPC executor) BEFORE this call.
    pub fn submit_order(
        ctx: Context<SubmitOrder>,
        nonce: u64,
        side: OrderSide,
        encrypted_price: Pubkey,
        encrypted_amount: Pubkey,
    ) -> Result<()> {
        let order = &mut ctx.accounts.order;
        let clock = Clock::get()?;

        order.owner = ctx.accounts.owner.key();
        order.side = side;
        order.encrypted_price = encrypted_price;
        order.encrypted_amount = encrypted_amount;
        order.status = OrderStatus::Pending;
        order.matched_with = Pubkey::default();
        order.output_price = Pubkey::default();
        order.output_amount = Pubkey::default();
        order.nonce = nonce;
        order.created_at = clock.unix_timestamp;
        order.bump = ctx.bumps.order;

        emit!(OrderSubmitted {
            order: order.key(),
            owner: order.owner,
            side,
            encrypted_price,
            encrypted_amount,
            timestamp: clock.unix_timestamp,
        });

        msg!("Order submitted: {}", order.key());
        Ok(())
    }

    /// Run the FHE match graph between a buy and a sell order.
    ///
    /// CPIs into the Encrypt program via the auto-generated `match_orders`
    /// method on `EncryptContext` (see fhe.rs). Inputs are the buyer's and
    /// seller's encrypted price/amount ciphertexts (passed by pubkey, verified
    /// against the Order PDAs). Outputs are three freshly-allocated
    /// CiphertextAccounts that the Encrypt executor writes into:
    ///   - fill_buyer_ct, fill_seller_ct, exec_price_ct
    ///
    /// After the CPI completes, the resulting ciphertext pubkeys are persisted
    /// on each Order PDA so settle_match / decryption can find them later:
    ///   buy_order : output_price = exec_price, output_amount = fill_buyer
    ///   sell_order: output_price = exec_price, output_amount = fill_seller
    ///
    /// `cpi_authority_bump` is taken as an arg (cheaper than re-deriving the
    /// PDA every call); on mismatch invoke_signed will fail-fast.
    pub fn execute_match(ctx: Context<ExecuteMatch>, cpi_authority_bump: u8) -> Result<()> {
        require!(
            ctx.accounts.buy_price_ct.key() == ctx.accounts.buy_order.encrypted_price
                && ctx.accounts.buy_amount_ct.key() == ctx.accounts.buy_order.encrypted_amount,
            NoctexError::CiphertextMismatch
        );
        require!(
            ctx.accounts.sell_price_ct.key() == ctx.accounts.sell_order.encrypted_price
                && ctx.accounts.sell_amount_ct.key() == ctx.accounts.sell_order.encrypted_amount,
            NoctexError::CiphertextMismatch
        );

        invoke_match_orders(
            &ctx.accounts.encrypt_program.to_account_info(),
            &ctx.accounts.encrypt_config.to_account_info(),
            &ctx.accounts.encrypt_deposit.to_account_info(),
            &ctx.accounts.caller_program.to_account_info(),
            &ctx.accounts.encrypt_cpi_authority.to_account_info(),
            &ctx.accounts.network_encryption_key.to_account_info(),
            &ctx.accounts.payer.to_account_info(),
            &ctx.accounts.encrypt_event_authority.to_account_info(),
            &ctx.accounts.system_program.to_account_info(),
            cpi_authority_bump,
            [
                &ctx.accounts.buy_price_ct.to_account_info(),
                &ctx.accounts.sell_price_ct.to_account_info(),
                &ctx.accounts.buy_amount_ct.to_account_info(),
                &ctx.accounts.sell_amount_ct.to_account_info(),
            ],
            [
                &ctx.accounts.fill_buyer_ct.to_account_info(),
                &ctx.accounts.fill_seller_ct.to_account_info(),
                &ctx.accounts.exec_price_ct.to_account_info(),
            ],
        )?;

        let buy = &mut ctx.accounts.buy_order;
        let sell = &mut ctx.accounts.sell_order;
        let exec_price_key = ctx.accounts.exec_price_ct.key();

        buy.status = OrderStatus::Matching;
        sell.status = OrderStatus::Matching;
        buy.matched_with = sell.key();
        sell.matched_with = buy.key();

        buy.output_price = exec_price_key;
        buy.output_amount = ctx.accounts.fill_buyer_ct.key();
        sell.output_price = exec_price_key;
        sell.output_amount = ctx.accounts.fill_seller_ct.key();

        let clock = Clock::get()?;
        emit!(MatchInitiated {
            buy_order: buy.key(),
            sell_order: sell.key(),
            timestamp: clock.unix_timestamp,
        });

        msg!(
            "Match graph executed: buy={} sell={} exec_price_ct={}",
            buy.key(),
            sell.key(),
            exec_price_key
        );
        Ok(())
    }

    /// Finalize a matched pair: transition both orders from Matching to
    /// Settled. The output ciphertext pubkeys were already written by
    /// `execute_match` after the FHE CPI committed; this instruction just
    /// records that both sides agree to settle on those ciphertexts. The
    /// subsequent `sign_settlement` + `finalize_settlement` flow then drives
    /// the Ika 2PC-MPC signature over the settlement digest.
    pub fn settle_match(ctx: Context<SettleMatch>) -> Result<()> {
        let buy = &mut ctx.accounts.buy_order;
        let sell = &mut ctx.accounts.sell_order;

        buy.status = OrderStatus::Settled;
        sell.status = OrderStatus::Settled;

        let clock = Clock::get()?;
        emit!(MatchSettled {
            buy_order: buy.key(),
            sell_order: sell.key(),
            output_price: buy.output_price,
            output_amount: buy.output_amount,
            timestamp: clock.unix_timestamp,
        });

        msg!(
            "Match settled: buy={} sell={} exec_price_ct={}",
            buy.key(),
            sell.key(),
            buy.output_price
        );
        Ok(())
    }

    /// Initialize the dWallet config PDA. Records the Ika dWallet ID this
    /// program will sign settlements for, plus the bumps for both the config
    /// PDA and the CPI-authority PDA whose seed is `b"__ika_cpi_authority"`.
    /// Run once after deployment; the Ika dWallet should already have had
    /// its authority transferred to the cpi_authority PDA off-chain via Ika's
    /// own client (using the same seed).
    pub fn initialize_dwallet(
        ctx: Context<InitializeDWallet>,
        dwallet_id: Pubkey,
    ) -> Result<()> {
        let cfg = &mut ctx.accounts.dwallet_config;
        cfg.dwallet_id = dwallet_id;
        cfg.authority = ctx.accounts.authority.key();
        cfg.bump = ctx.bumps.dwallet_config;
        cfg.cpi_authority_bump = ctx.bumps.cpi_authority;

        emit!(DWalletInitialized {
            dwallet_id,
            cpi_authority: ctx.accounts.cpi_authority.key(),
            authority: cfg.authority,
        });

        msg!(
            "dWallet config initialized: dwallet_id={} cpi_authority={}",
            dwallet_id,
            ctx.accounts.cpi_authority.key()
        );
        Ok(())
    }

    /// Refresh the recorded dWallet ID (and CPI-authority bump if changed).
    /// Useful when re-running DKG: a fresh dWallet ID needs to replace the
    /// old one without recreating the DWalletConfig PDA. Only the authority
    /// that initialized the config can update it.
    pub fn update_dwallet_id(
        ctx: Context<UpdateDWalletId>,
        new_dwallet_id: Pubkey,
    ) -> Result<()> {
        let cfg = &mut ctx.accounts.dwallet_config;
        require!(
            cfg.authority == ctx.accounts.authority.key(),
            NoctexError::Unauthorized
        );
        cfg.dwallet_id = new_dwallet_id;
        cfg.cpi_authority_bump = ctx.bumps.cpi_authority;

        emit!(DWalletInitialized {
            dwallet_id: new_dwallet_id,
            cpi_authority: ctx.accounts.cpi_authority.key(),
            authority: cfg.authority,
        });

        msg!("dWallet ID updated: {}", new_dwallet_id);
        Ok(())
    }

    /// Sign a settlement message via the Ika dWallet. CPIs into Ika's
    /// `approve_message` (discriminator 8); creates a MessageApproval PDA
    /// with status=Pending. The Ika network produces the 2PC-MPC signature
    /// off-chain and the NOA writes it back via CommitSignature.
    ///
    /// `message_approval` must be the PDA address derived per Ika's seeds
    /// (computed client-side); `message_approval_bump` is its bump.
    pub fn sign_settlement(
        ctx: Context<SignSettlement>,
        message_approval_bump: u8,
        message_digest: [u8; 32],
        message_metadata_digest: [u8; 32],
        user_pubkey: Pubkey,
        signature_scheme: u16,
    ) -> Result<()> {
        let ix_data = approve_message_data(
            message_approval_bump,
            &message_digest,
            &message_metadata_digest,
            &user_pubkey,
            signature_scheme,
        );

        invoke_approve_message(
            ix_data,
            &ctx.accounts.coordinator,
            &ctx.accounts.message_approval,
            &ctx.accounts.dwallet,
            &ctx.accounts.caller_program,
            &ctx.accounts.cpi_authority,
            &ctx.accounts.payer,
            &ctx.accounts.system_program,
            &ctx.accounts.ika_program,
            ctx.accounts.dwallet_config.cpi_authority_bump,
        )?;

        // Bind both Orders to this exact MessageApproval. finalize_settlement
        // refuses to run unless it sees the same account by key, so an
        // attacker can't substitute a signed approval from a different
        // settlement.
        let ma_key = ctx.accounts.message_approval.key();
        ctx.accounts.buy_order.message_approval = ma_key;
        ctx.accounts.sell_order.message_approval = ma_key;

        let clock = Clock::get()?;
        emit!(SettlementSigned {
            buy_order: ctx.accounts.buy_order.key(),
            sell_order: ctx.accounts.sell_order.key(),
            dwallet_id: ctx.accounts.dwallet_config.dwallet_id,
            message_approval: ma_key,
            message_digest,
            timestamp: clock.unix_timestamp,
        });

        msg!(
            "Settlement signed via Ika: buy={} sell={}",
            ctx.accounts.buy_order.key(),
            ctx.accounts.sell_order.key()
        );
        Ok(())
    }

    /// Verify the Ika 2PC-MPC signature on a settlement and transition both
    /// orders from Settled to Finalized. This is the gate that makes Ika
    /// load-bearing: no Settled → Finalized advancement without a valid
    /// signature published in the MessageApproval account by the Ika network.
    ///
    /// Checks (against the layout in Ika's `verify-signature.md` tutorial):
    ///   1. message_approval matches the pubkey sign_settlement bound to the
    ///      Orders — prevents swapping in a signature for a different match.
    ///   2. message_approval is owned by the Ika program — only Ika can write
    ///      `status = Signed` and the signature bytes.
    ///   3. byte[172] (status) == 1 (Signed).
    ///   4. bytes[173..175] (signature_len LE u16) > 0 and the slice fits.
    ///   5. (Implicit) The MessageApproval PDA seeds bind the signature to a
    ///      specific (dwallet, scheme, message_digest), so the existence of
    ///      this signed account proves Ika committed to that exact digest.
    ///
    /// Cryptographic verify (ed25519/secp256k1 against `dwallet_public_key`)
    /// is intentionally deferred — the pre-alpha mock signer commits an
    /// all-zero signature, so a real verifier would always fail on devnet.
    /// The structural gate above is the meaningful production constraint.
    pub fn finalize_settlement(ctx: Context<FinalizeSettlement>) -> Result<()> {
        let ma_account = &ctx.accounts.message_approval;
        let buy = &ctx.accounts.buy_order;
        let sell = &ctx.accounts.sell_order;

        require!(
            buy.message_approval == ma_account.key()
                && sell.message_approval == ma_account.key(),
            NoctexError::MessageApprovalMismatch
        );
        require!(
            ma_account.owner == &IKA_PROGRAM_ID,
            NoctexError::MessageApprovalNotIkaOwned
        );

        let data = ma_account.try_borrow_data()?;
        // 175 = signature offset; preflight that the sig_len bytes themselves
        // are inside the slice before reading them.
        require!(data.len() >= 175, NoctexError::MessageApprovalMalformed);

        let status = data[172];
        require!(status == 1, NoctexError::SettlementNotSigned);

        let sig_len = u16::from_le_bytes(
            data[173..175]
                .try_into()
                .map_err(|_| NoctexError::MessageApprovalMalformed)?,
        );
        require!(sig_len > 0, NoctexError::SettlementSignatureMissing);
        require!(
            data.len() >= 175 + sig_len as usize,
            NoctexError::MessageApprovalMalformed
        );
        drop(data);

        let buy = &mut ctx.accounts.buy_order;
        let sell = &mut ctx.accounts.sell_order;
        buy.status = OrderStatus::Finalized;
        sell.status = OrderStatus::Finalized;

        let clock = Clock::get()?;
        emit!(SettlementFinalized {
            buy_order: buy.key(),
            sell_order: sell.key(),
            message_approval: ma_account.key(),
            signature_len: sig_len,
            timestamp: clock.unix_timestamp,
        });

        msg!(
            "Settlement finalized: buy={} sell={} sig_len={}",
            buy.key(),
            sell.key(),
            sig_len
        );
        Ok(())
    }

    /// Cancel a pending order (only the owner can cancel, only while Pending).
    pub fn cancel_order(ctx: Context<CancelOrder>) -> Result<()> {
        require!(
            ctx.accounts.order.status == OrderStatus::Pending,
            NoctexError::OrderNotCancellable
        );
        ctx.accounts.order.status = OrderStatus::Cancelled;
        let clock = Clock::get()?;
        emit!(OrderCancelled {
            order: ctx.accounts.order.key(),
            timestamp: clock.unix_timestamp,
        });
        msg!("Order cancelled: {}", ctx.accounts.order.key());
        Ok(())
    }
}

// ─── Account Contexts ────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct SubmitOrder<'info> {
    #[account(
        init,
        payer = owner,
        space = Order::LEN,
        seeds = [b"order", owner.key().as_ref(), &nonce.to_le_bytes()],
        bump
    )]
    pub order: Account<'info, Order>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteMatch<'info> {
    #[account(
        mut,
        constraint = buy_order.side == OrderSide::Buy @ NoctexError::WrongOrderSide,
        constraint = buy_order.status == OrderStatus::Pending @ NoctexError::OrderNotPending,
    )]
    pub buy_order: Account<'info, Order>,

    #[account(
        mut,
        constraint = sell_order.side == OrderSide::Sell @ NoctexError::WrongOrderSide,
        constraint = sell_order.status == OrderStatus::Pending @ NoctexError::OrderNotPending,
        constraint = sell_order.key() != buy_order.key() @ NoctexError::OrderMismatch,
    )]
    pub sell_order: Account<'info, Order>,

    // ── FHE inputs (4) ── pinned by key against the Order PDAs in the handler.
    /// CHECK: Encrypt CiphertextAccount holding buyer's encrypted bid price.
    #[account(mut)]
    pub buy_price_ct: UncheckedAccount<'info>,
    /// CHECK: Encrypt CiphertextAccount holding seller's encrypted ask price.
    #[account(mut)]
    pub sell_price_ct: UncheckedAccount<'info>,
    /// CHECK: Encrypt CiphertextAccount holding buyer's encrypted amount.
    #[account(mut)]
    pub buy_amount_ct: UncheckedAccount<'info>,
    /// CHECK: Encrypt CiphertextAccount holding seller's encrypted amount.
    #[account(mut)]
    pub sell_amount_ct: UncheckedAccount<'info>,

    // ── FHE outputs (3) ── pre-existing Ciphertext accounts that the
    // Encrypt executor overwrites in place. Encrypt's `execute_graph` CPI
    // passes all remaining accounts as non-signer (per SDK), so it cannot
    // allocate new accounts; the caller must create these beforehand via
    // gRPC createInput (same path as the inputs).
    /// CHECK: Existing Encrypt CiphertextAccount that will be overwritten with `fill_buyer`.
    #[account(mut)]
    pub fill_buyer_ct: UncheckedAccount<'info>,
    /// CHECK: Existing Encrypt CiphertextAccount that will be overwritten with `fill_seller`.
    #[account(mut)]
    pub fill_seller_ct: UncheckedAccount<'info>,
    /// CHECK: Existing Encrypt CiphertextAccount that will be overwritten with `exec_price`.
    #[account(mut)]
    pub exec_price_ct: UncheckedAccount<'info>,

    // ── Encrypt CPI context (9 + bump-arg) ──
    /// CHECK: Encrypt program — pinned to ENCRYPT_PROGRAM_ID and executable.
    #[account(
        constraint = encrypt_program.key() == ENCRYPT_PROGRAM_ID @ NoctexError::Unauthorized,
        constraint = encrypt_program.executable @ NoctexError::Unauthorized,
    )]
    pub encrypt_program: UncheckedAccount<'info>,
    /// CHECK: Encrypt Config PDA — validated by Encrypt program.
    #[account(mut)]
    pub encrypt_config: UncheckedAccount<'info>,
    /// CHECK: Encrypt Deposit PDA — validated by Encrypt program.
    #[account(mut)]
    pub encrypt_deposit: UncheckedAccount<'info>,
    /// CHECK: Our CPI authority PDA for Encrypt (seed = b"__encrypt_cpi_authority").
    /// Bump is passed as instruction arg; invoke_signed fails on mismatch.
    #[account(
        seeds = [ENCRYPT_CPI_AUTHORITY_SEED],
        bump,
    )]
    pub encrypt_cpi_authority: UncheckedAccount<'info>,
    /// CHECK: Our own program account; Encrypt verifies executable=true.
    #[account(
        constraint = caller_program.key() == crate::ID @ NoctexError::Unauthorized,
        constraint = caller_program.executable @ NoctexError::Unauthorized,
    )]
    pub caller_program: UncheckedAccount<'info>,
    /// CHECK: Encrypt Network Encryption Key account.
    pub network_encryption_key: UncheckedAccount<'info>,
    /// CHECK: Encrypt event-authority PDA.
    pub encrypt_event_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleMatch<'info> {
    #[account(
        mut,
        constraint = buy_order.status == OrderStatus::Matching @ NoctexError::OrderNotMatching,
    )]
    pub buy_order: Account<'info, Order>,

    #[account(
        mut,
        constraint = sell_order.status == OrderStatus::Matching @ NoctexError::OrderNotMatching,
        constraint = sell_order.matched_with == buy_order.key() @ NoctexError::OrderMismatch,
        constraint = buy_order.matched_with == sell_order.key() @ NoctexError::OrderMismatch,
    )]
    pub sell_order: Account<'info, Order>,

    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct InitializeDWallet<'info> {
    #[account(
        init,
        payer = authority,
        space = DWalletConfig::LEN,
        seeds = [b"dwallet-config"],
        bump,
    )]
    pub dwallet_config: Account<'info, DWalletConfig>,

    /// CHECK: PDA at the Ika-required seed. The Ika dWallet's authority
    /// must have been transferred to this address off-chain so that only
    /// this program can approve messages on it.
    #[account(
        seeds = [CPI_AUTHORITY_SEED],
        bump,
    )]
    pub cpi_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateDWalletId<'info> {
    #[account(
        mut,
        seeds = [b"dwallet-config"],
        bump = dwallet_config.bump,
    )]
    pub dwallet_config: Account<'info, DWalletConfig>,

    /// CHECK: PDA at the Ika-required seed; bump captured for sign_settlement.
    #[account(
        seeds = [CPI_AUTHORITY_SEED],
        bump,
    )]
    pub cpi_authority: UncheckedAccount<'info>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct SignSettlement<'info> {
    #[account(
        seeds = [b"dwallet-config"],
        bump = dwallet_config.bump,
    )]
    pub dwallet_config: Account<'info, DWalletConfig>,

    #[account(
        mut,
        constraint = buy_order.status == OrderStatus::Settled @ NoctexError::OrderNotSettled,
    )]
    pub buy_order: Account<'info, Order>,

    #[account(
        mut,
        constraint = sell_order.status == OrderStatus::Settled @ NoctexError::OrderNotSettled,
        constraint = sell_order.matched_with == buy_order.key() @ NoctexError::OrderMismatch,
        constraint = buy_order.matched_with == sell_order.key() @ NoctexError::OrderMismatch,
    )]
    pub sell_order: Account<'info, Order>,

    /// CHECK: Ika DWalletCoordinator PDA — Ika program validates address.
    pub coordinator: UncheckedAccount<'info>,

    /// CHECK: Ika MessageApproval PDA (writable) — created by Ika program
    /// from this transaction. Address derived client-side per Ika seeds.
    #[account(mut)]
    pub message_approval: UncheckedAccount<'info>,

    /// CHECK: The Ika dWallet account; pinned to dwallet_config.dwallet_id.
    #[account(
        constraint = dwallet.key() == dwallet_config.dwallet_id @ NoctexError::Unauthorized,
    )]
    pub dwallet: UncheckedAccount<'info>,

    /// CHECK: Our own program account, passed to Ika as caller_program.
    /// Ika's approve_message verifies executable=true.
    #[account(
        constraint = caller_program.key() == crate::ID @ NoctexError::Unauthorized,
        constraint = caller_program.executable @ NoctexError::Unauthorized,
    )]
    pub caller_program: UncheckedAccount<'info>,

    /// CHECK: Our CPI authority PDA — signs the Ika CPI via invoke_signed.
    /// Bump is taken from dwallet_config rather than re-derived to avoid
    /// PDA-derivation cost in this hot path.
    #[account(
        seeds = [CPI_AUTHORITY_SEED],
        bump = dwallet_config.cpi_authority_bump,
    )]
    pub cpi_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,

    /// CHECK: Ika program — pinned to IKA_PROGRAM_ID and must be executable.
    #[account(
        constraint = ika_program.key() == IKA_PROGRAM_ID @ NoctexError::Unauthorized,
        constraint = ika_program.executable @ NoctexError::Unauthorized,
    )]
    pub ika_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct FinalizeSettlement<'info> {
    #[account(
        mut,
        constraint = buy_order.status == OrderStatus::Settled @ NoctexError::OrderNotSettled,
    )]
    pub buy_order: Account<'info, Order>,

    #[account(
        mut,
        constraint = sell_order.status == OrderStatus::Settled @ NoctexError::OrderNotSettled,
        constraint = sell_order.matched_with == buy_order.key() @ NoctexError::OrderMismatch,
        constraint = buy_order.matched_with == sell_order.key() @ NoctexError::OrderMismatch,
    )]
    pub sell_order: Account<'info, Order>,

    /// CHECK: Ika MessageApproval account. We require:
    /// - key matches the pubkey stored on the Orders by sign_settlement
    /// - owner is the Ika program (only it can write the Signed status)
    /// - byte[139] == 1 (Signed) and byte[140..142] is a non-zero sig_len
    pub message_approval: UncheckedAccount<'info>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct CancelOrder<'info> {
    #[account(
        mut,
        has_one = owner @ NoctexError::Unauthorized,
    )]
    pub order: Account<'info, Order>,

    pub owner: Signer<'info>,
}

// ─── Errors ──────────────────────────────────────────────────────────────────

#[error_code]
pub enum NoctexError {
    #[msg("Order must be Pending to execute match")]
    OrderNotPending,
    #[msg("Order must be in Matching state to settle")]
    OrderNotMatching,
    #[msg("Order must be Settled before signing settlement")]
    OrderNotSettled,
    #[msg("Wrong order side for this operation")]
    WrongOrderSide,
    #[msg("Orders do not match each other")]
    OrderMismatch,
    #[msg("Only pending orders can be cancelled")]
    OrderNotCancellable,
    #[msg("Unauthorized — not the order owner")]
    Unauthorized,
    #[msg("Ciphertext account does not match the one recorded on the Order PDA")]
    CiphertextMismatch,
    #[msg("MessageApproval account does not match the one recorded on the Orders")]
    MessageApprovalMismatch,
    #[msg("MessageApproval account is not owned by the Ika program")]
    MessageApprovalNotIkaOwned,
    #[msg("MessageApproval account is too short or malformed")]
    MessageApprovalMalformed,
    #[msg("MessageApproval status is not Signed yet — Ika network has not finalized")]
    SettlementNotSigned,
    #[msg("MessageApproval reports Signed but signature length is zero")]
    SettlementSignatureMissing,
}
