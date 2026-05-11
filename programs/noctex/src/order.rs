use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct Order {
    pub owner: Pubkey,
    pub side: OrderSide,
    pub encrypted_price: Pubkey,
    pub encrypted_amount: Pubkey,
    pub status: OrderStatus,
    pub matched_with: Pubkey,
    pub output_price: Pubkey,
    pub output_amount: Pubkey,
    /// MessageApproval PDA address recorded by sign_settlement so
    /// finalize_settlement can match the account it's verifying against.
    /// Default::default() until sign_settlement runs.
    pub message_approval: Pubkey,
    pub nonce: u64,
    pub created_at: i64,
    pub bump: u8,
}

impl Order {
    pub const LEN: usize =
        8 + 32 + 1 + 32 + 32 + 1 + 32 + 32 + 32 + 32 + 8 + 8 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Default, Debug)]
pub enum OrderSide {
    #[default]
    Buy,
    Sell,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Default, Debug)]
pub enum OrderStatus {
    #[default]
    Pending,
    Matching,
    Settled,
    Cancelled,
    /// Ika 2PC-MPC signature has been verified on-chain. Terminal state.
    Finalized,
}

#[event]
pub struct OrderSubmitted {
    pub order: Pubkey,
    pub owner: Pubkey,
    pub side: OrderSide,
    pub encrypted_price: Pubkey,
    pub encrypted_amount: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct MatchInitiated {
    pub buy_order: Pubkey,
    pub sell_order: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct MatchSettled {
    pub buy_order: Pubkey,
    pub sell_order: Pubkey,
    pub output_price: Pubkey,
    pub output_amount: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct OrderCancelled {
    pub order: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct SettlementFinalized {
    pub buy_order: Pubkey,
    pub sell_order: Pubkey,
    pub message_approval: Pubkey,
    pub signature_len: u16,
    pub timestamp: i64,
}
