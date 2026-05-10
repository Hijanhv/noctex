use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
};

/// Ika dWallet program on Solana devnet.
pub const IKA_PROGRAM_ID: Pubkey = pubkey!("87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY");

/// CPI authority seed expected by the Ika program. Literal from Ika docs.
pub const CPI_AUTHORITY_SEED: &[u8] = b"__ika_cpi_authority";

const IX_APPROVE_MESSAGE: u8 = 8;
const IX_TRANSFER_DWALLET: u8 = 24;

pub const SIG_ECDSA_KECCAK_256: u16 = 0;
pub const SIG_ECDSA_SHA_256: u16 = 1;
pub const SIG_ECDSA_DOUBLE_SHA_256: u16 = 2;
pub const SIG_TAPROOT_SHA_256: u16 = 3;
pub const SIG_ECDSA_BLAKE2B_256: u16 = 4;
pub const SIG_EDDSA_SHA_512: u16 = 5;
pub const SIG_SCHNORRKEL_MERLIN: u16 = 6;

#[account]
#[derive(Default)]
pub struct DWalletConfig {
    pub dwallet_id: Pubkey,
    pub authority: Pubkey,
    pub bump: u8,
    pub cpi_authority_bump: u8,
}

impl DWalletConfig {
    pub const LEN: usize = 8 + 32 + 32 + 1 + 1;
}

#[event]
pub struct DWalletInitialized {
    pub dwallet_id: Pubkey,
    pub cpi_authority: Pubkey,
    pub authority: Pubkey,
}

#[event]
pub struct SettlementSigned {
    pub buy_order: Pubkey,
    pub sell_order: Pubkey,
    pub dwallet_id: Pubkey,
    pub message_approval: Pubkey,
    pub message_digest: [u8; 32],
    pub timestamp: i64,
}

/// `transfer_dwallet` (disc 24) layout = `[24, new_authority(32)]` = 33 bytes.
pub fn transfer_dwallet_data(new_authority: &Pubkey) -> Vec<u8> {
    let mut data = Vec::with_capacity(33);
    data.push(IX_TRANSFER_DWALLET);
    data.extend_from_slice(new_authority.as_ref());
    data
}

/// `approve_message` (disc 8) layout =
/// `[8, bump(1), message_digest(32), message_metadata_digest(32), user_pubkey(32), signature_scheme(u16 LE)]`
/// = 100 bytes.
pub fn approve_message_data(
    bump: u8,
    message_digest: &[u8; 32],
    message_metadata_digest: &[u8; 32],
    user_pubkey: &Pubkey,
    signature_scheme: u16,
) -> Vec<u8> {
    let mut data = Vec::with_capacity(100);
    data.push(IX_APPROVE_MESSAGE);
    data.push(bump);
    data.extend_from_slice(message_digest);
    data.extend_from_slice(message_metadata_digest);
    data.extend_from_slice(user_pubkey.as_ref());
    data.extend_from_slice(&signature_scheme.to_le_bytes());
    data
}

/// CPI into Ika's `transfer_dwallet`. Hands dWallet authority over to our
/// CPI-authority PDA so only this program can approve future signing.
/// Accounts (per Ika docs): 0=caller_program, 1=cpi_authority(S), 2=dwallet(W).
#[allow(dead_code)]
pub fn invoke_transfer_dwallet<'info>(
    new_authority: &Pubkey,
    caller_program: &AccountInfo<'info>,
    cpi_authority: &AccountInfo<'info>,
    dwallet: &AccountInfo<'info>,
    ika_program: &AccountInfo<'info>,
    cpi_authority_bump: u8,
) -> Result<()> {
    let accounts = vec![
        AccountMeta::new_readonly(caller_program.key(), false),
        AccountMeta::new_readonly(cpi_authority.key(), true),
        AccountMeta::new(dwallet.key(), false),
    ];

    let ix = Instruction {
        program_id: IKA_PROGRAM_ID,
        accounts,
        data: transfer_dwallet_data(new_authority),
    };

    let account_infos = [
        caller_program.clone(),
        cpi_authority.clone(),
        dwallet.clone(),
        ika_program.clone(),
    ];

    let seeds: &[&[u8]] = &[CPI_AUTHORITY_SEED, &[cpi_authority_bump]];
    invoke_signed(&ix, &account_infos, &[seeds])?;
    Ok(())
}

/// CPI into Ika's `approve_message`. Creates the MessageApproval PDA on the
/// Ika side with status=Pending; the Ika network detects it and produces a
/// 2PC-MPC signature, which the NOA writes back via CommitSignature.
/// Accounts: 0=coordinator, 1=message_approval(W), 2=dwallet, 3=caller_program,
/// 4=cpi_authority(S), 5=payer(W,S), 6=system_program.
#[allow(clippy::too_many_arguments)]
pub fn invoke_approve_message<'info>(
    ix_data: Vec<u8>,
    coordinator: &AccountInfo<'info>,
    message_approval: &AccountInfo<'info>,
    dwallet: &AccountInfo<'info>,
    caller_program: &AccountInfo<'info>,
    cpi_authority: &AccountInfo<'info>,
    payer: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    ika_program: &AccountInfo<'info>,
    cpi_authority_bump: u8,
) -> Result<()> {
    let accounts = vec![
        AccountMeta::new_readonly(coordinator.key(), false),
        AccountMeta::new(message_approval.key(), false),
        AccountMeta::new_readonly(dwallet.key(), false),
        AccountMeta::new_readonly(caller_program.key(), false),
        AccountMeta::new_readonly(cpi_authority.key(), true),
        AccountMeta::new(payer.key(), true),
        AccountMeta::new_readonly(system_program.key(), false),
    ];

    let ix = Instruction {
        program_id: IKA_PROGRAM_ID,
        accounts,
        data: ix_data,
    };

    let account_infos = [
        coordinator.clone(),
        message_approval.clone(),
        dwallet.clone(),
        caller_program.clone(),
        cpi_authority.clone(),
        payer.clone(),
        system_program.clone(),
        ika_program.clone(),
    ];

    let seeds: &[&[u8]] = &[CPI_AUTHORITY_SEED, &[cpi_authority_bump]];
    invoke_signed(&ix, &account_infos, &[seeds])?;
    Ok(())
}
