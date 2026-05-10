use encrypt_dsl::prelude::*;
#[allow(unused_imports)]
use encrypt_types::encrypted::EUint64;

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
