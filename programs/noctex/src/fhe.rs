use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
};
use encrypt_dsl::prelude::*;
#[allow(unused_imports)]
use encrypt_types::encrypted::EUint64;

/// CPI-authority seed expected by the Encrypt program.
pub const ENCRYPT_CPI_AUTHORITY_SEED: &[u8] = b"__encrypt_cpi_authority";

/// `execute_graph` discriminator on the Encrypt program (verified from the SDK).
const ENCRYPT_IX_EXECUTE_GRAPH: u8 = 4;

/// FHE order matching graph — runs entirely on ciphertexts.
///
/// Inputs:  bid_price, ask_price, bid_amount, ask_amount  (all EUint64)
/// Outputs: (fill_buyer, fill_seller, exec_price)
///
/// Graph logic:
///   matched     = bid_price >= ask_price
///   min_amount  = min(bid_amount, ask_amount)
///   fill_*      = matched ? min_amount : 0
///   exec_price  = matched ? ask_price  : 0
///
/// The `if` expression compiles to a Select node — both branches are always
/// evaluated and the executor picks based on the encrypted condition.
/// Variables can be reused across branches; the macro tracks them as graph
/// node references rather than as moved Rust values (mirroring the
/// cast_vote_graph example in the Encrypt SDK tutorial).
#[encrypt_fn]
pub fn match_orders(
    bid_price: EUint64,
    ask_price: EUint64,
    bid_amount: EUint64,
    ask_amount: EUint64,
) -> (EUint64, EUint64, EUint64) {
    let matched = bid_price.is_greater_or_equal(&ask_price);
    let min_amount = bid_amount.min(&ask_amount);

    let fill_buyer = if matched { min_amount } else { EUint64::from(0u64) };
    let fill_seller = if matched { min_amount } else { EUint64::from(0u64) };
    let exec_price = if matched { ask_price } else { EUint64::from(0u64) };

    (fill_buyer, fill_seller, exec_price)
}

/// Invoke `execute_graph` on the Encrypt program with the match_orders graph.
///
/// We could use `encrypt_anchor::EncryptContext::match_orders`, but that crate
/// requires `anchor-lang = "1"` and conflicts with our 0.32 line. The Encrypt
/// program only cares about the byte layout of the instruction, so we build
/// the CPI ourselves using the same wire format as the SDK:
///
///   ix_data = [4u8, graph_len_u16_le, graph_bytes, num_inputs_u8]
///   accounts: [config(W), deposit(W), caller_program, cpi_authority(S),
///              network_encryption_key, payer(W,S), event_authority,
///              encrypt_program, ...input_cts(W), ...output_cts(W)]
///   signer:   PDA(`b"__encrypt_cpi_authority"`, bump)
///
/// `cpi_authority_bump` is passed in to avoid recomputing the PDA.
#[allow(clippy::too_many_arguments)]
pub fn invoke_match_orders<'info>(
    encrypt_program: &AccountInfo<'info>,
    encrypt_config: &AccountInfo<'info>,
    encrypt_deposit: &AccountInfo<'info>,
    caller_program: &AccountInfo<'info>,
    encrypt_cpi_authority: &AccountInfo<'info>,
    network_encryption_key: &AccountInfo<'info>,
    payer: &AccountInfo<'info>,
    encrypt_event_authority: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    cpi_authority_bump: u8,
    inputs: [&AccountInfo<'info>; 4],
    outputs: [&AccountInfo<'info>; 3],
) -> Result<()> {
    let graph = match_orders();
    let num_inputs: u8 = inputs.len() as u8;

    let mut ix_data = Vec::with_capacity(1 + 2 + graph.len() + 1);
    ix_data.push(ENCRYPT_IX_EXECUTE_GRAPH);
    ix_data.extend_from_slice(&(graph.len() as u16).to_le_bytes());
    ix_data.extend_from_slice(&graph);
    ix_data.push(num_inputs);

    let mut metas = vec![
        AccountMeta::new(encrypt_config.key(), false),
        AccountMeta::new(encrypt_deposit.key(), false),
        AccountMeta::new_readonly(caller_program.key(), false),
        AccountMeta::new_readonly(encrypt_cpi_authority.key(), true),
        AccountMeta::new_readonly(network_encryption_key.key(), false),
        AccountMeta::new(payer.key(), true),
        AccountMeta::new_readonly(encrypt_event_authority.key(), false),
        AccountMeta::new_readonly(encrypt_program.key(), false),
    ];
    for acct in inputs.iter().chain(outputs.iter()) {
        metas.push(AccountMeta::new(acct.key(), false));
    }

    let ix = Instruction {
        program_id: encrypt_program.key(),
        accounts: metas,
        data: ix_data,
    };

    let mut infos = vec![
        encrypt_config.clone(),
        encrypt_deposit.clone(),
        caller_program.clone(),
        encrypt_cpi_authority.clone(),
        network_encryption_key.clone(),
        payer.clone(),
        encrypt_event_authority.clone(),
        encrypt_program.clone(),
    ];
    for acct in inputs.iter().chain(outputs.iter()) {
        infos.push((*acct).clone());
    }
    // system_program isn't passed as a meta but invoke_signed needs every
    // referenced AccountInfo handle, plus we leave it ready for any sub-CPI
    // the Encrypt program may need to allocate output accounts.
    infos.push(system_program.clone());

    let seeds: &[&[u8]] = &[ENCRYPT_CPI_AUTHORITY_SEED, &[cpi_authority_bump]];
    invoke_signed(&ix, &infos, &[seeds])?;
    Ok(())
}
