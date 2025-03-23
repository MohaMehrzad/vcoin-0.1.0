use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::pubkey::Pubkey;

/// Maximum number of vesting beneficiaries
pub const MAX_VESTING_BENEFICIARIES: usize = 100;

/// Presale state
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq)]
pub struct PresaleState {
    /// Is initialized
    pub is_initialized: bool,
    /// Authority that can modify the presale
    pub authority: Pubkey,
    /// Mint address for the token
    pub mint: Pubkey,
    /// Treasury account that receives funds
    pub treasury: Pubkey,
    /// Start timestamp
    pub start_time: i64,
    /// End timestamp
    pub end_time: i64,
    /// Token price in USD (as u64 with 6 decimals precision)
    pub token_price: u64,
    /// Hard cap for the presale
    pub hard_cap: u64,
    /// Soft cap for the presale
    pub soft_cap: u64,
    /// Minimum purchase amount in USD (as u64 with 6 decimals precision)
    pub min_purchase: u64,
    /// Maximum purchase amount in USD (as u64 with 6 decimals precision)
    pub max_purchase: u64,
    /// Total tokens sold
    pub total_tokens_sold: u64,
    /// Total USD raised
    pub total_usd_raised: u64,
    /// Number of buyers
    pub num_buyers: u32,
    /// Presale is active
    pub is_active: bool,
    /// Presale has ended
    pub has_ended: bool,
}

impl PresaleState {
    /// Get the size of the presale state
    pub fn get_size() -> usize {
        std::mem::size_of::<Self>()
    }
}

/// Vesting beneficiary
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq)]
pub struct VestingBeneficiary {
    /// Beneficiary public key
    pub beneficiary: Pubkey,
    /// Total amount of tokens to vest
    pub total_amount: u64,
    /// Amount of tokens already released
    pub released_amount: u64,
}

/// Vesting state
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq)]
pub struct VestingState {
    /// Is initialized
    pub is_initialized: bool,
    /// Authority that can modify the vesting schedule
    pub authority: Pubkey,
    /// Mint address for the token
    pub mint: Pubkey,
    /// Total tokens to be vested
    pub total_tokens: u64,
    /// Total tokens allocated to beneficiaries
    pub total_allocated: u64,
    /// Total tokens released
    pub total_released: u64,
    /// Vesting start timestamp
    pub start_time: i64,
    /// Release interval in seconds
    pub release_interval: i64,
    /// Number of releases
    pub num_releases: u8,
    /// Last release timestamp
    pub last_release_time: i64,
    /// Number of beneficiaries
    pub num_beneficiaries: u8,
    /// Beneficiaries
    pub beneficiaries: Vec<VestingBeneficiary>,
}

impl VestingState {
    /// Get the size of the vesting state
    pub fn get_size() -> usize {
        let base_size = std::mem::size_of::<Self>() - std::mem::size_of::<Vec<VestingBeneficiary>>();
        let vec_size = std::mem::size_of::<VestingBeneficiary>() * MAX_VESTING_BENEFICIARIES;
        base_size + vec_size
    }
}

/// Token metadata
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq)]
pub struct TokenMetadata {
    /// Is initialized
    pub is_initialized: bool,
    /// Authority that can modify the metadata
    pub authority: Pubkey,
    /// Mint address for the token
    pub mint: Pubkey,
    /// Name of the token
    pub name: String,
    /// Symbol of the token
    pub symbol: String,
    /// URI for the token
    pub uri: String,
}

impl TokenMetadata {
    /// Get the size of the token metadata with string allocations
    pub fn get_size(name_len: usize, symbol_len: usize, uri_len: usize) -> usize {
        std::mem::size_of::<Self>() - 24 // Subtract the String pointer sizes
            + 4 + name_len               // Add the actual string size with length
            + 4 + symbol_len             // Add the actual string size with length
            + 4 + uri_len                // Add the actual string size with length
    }
}

/// Purchase record
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq)]
pub struct PurchaseRecord {
    /// Buyer public key
    pub buyer: Pubkey,
    /// Amount in USD (as u64 with 6 decimals precision)
    pub amount_usd: u64,
    /// Tokens purchased
    pub tokens_purchased: u64,
    /// Timestamp of purchase
    pub timestamp: i64,
} 