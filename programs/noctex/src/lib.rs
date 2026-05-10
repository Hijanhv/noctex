use anchor_lang::prelude::*;

pub mod order;
pub mod fhe;
pub mod dwallet;

use order::*;
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

    /// Initiate FHE matching between a buy and sell order.
    ///
    /// In the full integration this CPIs into the Encrypt program via the
    /// auto-generated `MatchOrdersCpi` trait on `EncryptContext` to evaluate
    /// the `match_orders` graph (see fhe.rs). For now this transitions order
    /// state and emits MatchInitiated; the FHE CPI is wired after the
    /// encrypt-anchor source is available locally so EncryptContext fields
    /// can be matched verbatim.
    pub fn execute_match(ctx: Context<ExecuteMatch>) -> Result<()> {
        let clock = Clock::get()?;

        ctx.accounts.buy_order.status = OrderStatus::Matching;
        ctx.accounts.sell_order.status = OrderStatus::Matching;
        ctx.accounts.buy_order.matched_with = ctx.accounts.sell_order.key();
        ctx.accounts.sell_order.matched_with = ctx.accounts.buy_order.key();

        emit!(MatchInitiated {
            buy_order: ctx.accounts.buy_order.key(),
            sell_order: ctx.accounts.sell_order.key(),
            timestamp: clock.unix_timestamp,
        });

        msg!(
            "Match initiated: buy={} sell={}",
            ctx.accounts.buy_order.key(),
            ctx.accounts.sell_order.key()
        );
        Ok(())
    }

    /// Settle a matched pair after the Encrypt executor has committed the
    /// FHE output ciphertexts. The output pubkeys point at CiphertextAccounts
    /// holding the encrypted (fill_qty, exec_price). Decryption is a separate
    /// off-chain step initiated by the order owner.
    pub fn settle_match(
        ctx: Context<SettleMatch>,
        output_price: Pubkey,
        output_amount: Pubkey,
    ) -> Result<()> {
        let clock = Clock::get()?;

        ctx.accounts.buy_order.output_price = output_price;
        ctx.accounts.buy_order.output_amount = output_amount;
        ctx.accounts.sell_order.output_price = output_price;
        ctx.accounts.sell_order.output_amount = output_amount;

        ctx.accounts.buy_order.status = OrderStatus::Settled;
        ctx.accounts.sell_order.status = OrderStatus::Settled;

        emit!(MatchSettled {
            buy_order: ctx.accounts.buy_order.key(),
            sell_order: ctx.accounts.sell_order.key(),
            output_price,
            output_amount,
            timestamp: clock.unix_timestamp,
        });

        msg!(
            "Match settled: price_ct={} amount_ct={}",
            output_price,
            output_amount
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

        let clock = Clock::get()?;
        emit!(SettlementSigned {
            buy_order: ctx.accounts.buy_order.key(),
            sell_order: ctx.accounts.sell_order.key(),
            dwallet_id: ctx.accounts.dwallet_config.dwallet_id,
            message_approval: ctx.accounts.message_approval.key(),
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
        constraint = buy_order.status == OrderStatus::Settled @ NoctexError::OrderNotSettled,
    )]
    pub buy_order: Account<'info, Order>,

    #[account(
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
}
