use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::pubkey::Pubkey;
use solana_program::program_error::ProgramError;

/// Maximum number of vesting beneficiaries
pub const MAX_VESTING_BENEFICIARIES: usize = 100;

/// Stablecoin Type for presale contributions
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq)]
pub enum StablecoinType {
    /// USDC on Solana
    USDC,
    /// USDT on Solana
    USDT,
    /// Other supported stablecoin
    OTHER,
}

/// Presale contribution record with stablecoin tracking
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq)]
pub struct PresaleContribution {
    /// Buyer's public key
    pub buyer: Pubkey,
    /// Contribution amount in stablecoin (with token's decimals precision)
    pub amount: u64,
    /// Type of stablecoin used
    pub stablecoin_type: StablecoinType,
    /// Stablecoin mint address
    pub stablecoin_mint: Pubkey,
    /// Whether this contribution has been refunded
    pub refunded: bool,
    /// Timestamp of contribution
    pub timestamp: i64,
}

/// Presale state
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq)]
pub struct PresaleState {
    /// Is initialized
    pub is_initialized: bool,
    /// Authority that can modify the presale
    pub authority: Pubkey,
    /// Mint address for the token
    pub mint: Pubkey,
    /// Development treasury account that receives immediate funds (50%)
    pub dev_treasury: Pubkey,
    /// Locked treasury account for potential refunds (50%)
    pub locked_treasury: Pubkey,
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
    /// Token has been launched
    pub token_launched: bool,
    /// Token launch timestamp
    pub launch_timestamp: i64,
    /// Refund availability timestamp (launch_timestamp + 3 months)
    pub refund_available_timestamp: i64,
    /// Refund period end timestamp (refund_available_timestamp + 30 days)
    pub refund_period_end_timestamp: i64,
    /// Whether soft cap was reached
    pub soft_cap_reached: bool,
    /// List of allowed stablecoin mints
    pub allowed_stablecoins: Vec<Pubkey>,
    /// Individual contributions for refund tracking
    pub contributions: Vec<PresaleContribution>,
    /// List of unique buyer public keys
    pub buyer_pubkeys: Vec<Pubkey>,
    /// Whether dev funds need to be refunded (only if softcap not reached)
    pub dev_funds_refundable: bool,
    /// Timestamp when dev funds become refundable (1 year after launch if softcap not reached)
    pub dev_refund_available_timestamp: i64,
    /// Dev refund period end timestamp (30 days after dev_refund_available_timestamp)
    pub dev_refund_period_end_timestamp: i64,
}

impl PresaleState {
    /// Get the size of the presale state
    pub fn get_size() -> usize {
        // Base size excluding Vec<Pubkey> and Vec<PresaleContribution>
        let base_size = std::mem::size_of::<Self>() - std::mem::size_of::<Vec<Pubkey>>() - std::mem::size_of::<Vec<PresaleContribution>>() - std::mem::size_of::<Vec<Pubkey>>();
        
        // Start with space for 15,000 buyers as requested
        let buyers_capacity = 15_000;
        let buyers_vec_size = std::mem::size_of::<Pubkey>().checked_mul(buyers_capacity)
            .expect("Calculation error in get_size - buyers_vec_size overflow");
        
        // Space for up to 15,000 contributions
        let contributions_capacity = 15_000;
        let contribution_size = std::mem::size_of::<PresaleContribution>();
        let contributions_vec_size = contribution_size.checked_mul(contributions_capacity)
            .expect("Calculation error in get_size - contributions_vec_size overflow");
        
        // Space for up to 10 allowed stablecoins
        let stablecoins_capacity = 10;
        let stablecoins_vec_size = std::mem::size_of::<Pubkey>().checked_mul(stablecoins_capacity)
            .expect("Calculation error in get_size - stablecoins_vec_size overflow");
        
        // Add all components safely
        base_size.checked_add(buyers_vec_size)
            .and_then(|size| size.checked_add(contributions_vec_size))
            .and_then(|size| size.checked_add(stablecoins_vec_size))
            .expect("Calculation error in get_size - total size overflow")
    }
    
    /// Get the size needed for a specific number of buyers
    pub fn get_size_for_buyers(num_buyers: usize) -> usize {
        // Base size excluding Vec<Pubkey> and Vec<PresaleContribution>
        let base_size = std::mem::size_of::<Self>() - std::mem::size_of::<Vec<Pubkey>>() - std::mem::size_of::<Vec<PresaleContribution>>() - std::mem::size_of::<Vec<Pubkey>>();
        
        // Allocate space based on requested number of buyers
        let buyers_vec_size = std::mem::size_of::<Pubkey>().checked_mul(num_buyers)
            .expect("Calculation error in get_size_for_buyers - buyers_vec_size overflow");
        
        // Allocate same amount of space for contributions
        let contribution_size = std::mem::size_of::<PresaleContribution>();
        let contributions_vec_size = contribution_size.checked_mul(num_buyers)
            .expect("Calculation error in get_size_for_buyers - contributions_vec_size overflow");
        
        // Space for up to 10 allowed stablecoins
        let stablecoins_capacity = 10;
        let stablecoins_vec_size = std::mem::size_of::<Pubkey>().checked_mul(stablecoins_capacity)
            .expect("Calculation error in get_size_for_buyers - stablecoins_vec_size overflow");
        
        // Add all components safely
        base_size.checked_add(buyers_vec_size)
            .and_then(|size| size.checked_add(contributions_vec_size))
            .and_then(|size| size.checked_add(stablecoins_vec_size))
            .expect("Calculation error in get_size_for_buyers - total size overflow")
    }
    
    /// Find a contribution by buyer
    pub fn find_contribution(&self, buyer: &Pubkey) -> Option<(usize, &PresaleContribution)> {
        self.contributions.iter().enumerate().find(|(_, contribution)| &contribution.buyer == buyer)
    }
    
    /// Add allowed stablecoin
    pub fn add_allowed_stablecoin(&mut self, stablecoin_mint: Pubkey) -> Result<(), ProgramError> {
        if self.allowed_stablecoins.contains(&stablecoin_mint) {
            return Err(ProgramError::InvalidArgument);
        }
        
        if self.allowed_stablecoins.len() >= 10 {
            return Err(ProgramError::InvalidArgument);
        }
        
        self.allowed_stablecoins.push(stablecoin_mint);
        Ok(())
    }
    
    /// Check if a stablecoin is allowed
    pub fn is_stablecoin_allowed(&self, stablecoin_mint: &Pubkey) -> bool {
        self.allowed_stablecoins.contains(stablecoin_mint)
    }
    
    /// Get stablecoin type
    pub fn get_stablecoin_type(&self, stablecoin_mint: &Pubkey) -> Option<StablecoinType> {
        // Known USDC addresses on Solana
        const USDC_MAINNET: &str = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
        const USDC_DEVNET: &str = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
        
        // Known USDT addresses on Solana
        const USDT_MAINNET: &str = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
        const USDT_DEVNET: &str = "DAwBSXe6w9g37wdE2tCrFbho3QHKZi4PjuBytQCULap2";
        
        // First check if stablecoin is allowed
        if !self.is_stablecoin_allowed(stablecoin_mint) {
            return None;
        }
        
        // Get the mint string for comparison
        let mint_str = stablecoin_mint.to_string();
        
        // Check if it's a known USDC address
        if mint_str == USDC_MAINNET || 
           mint_str == USDC_DEVNET {
            return Some(StablecoinType::USDC);
        }
        
        // Check if it's a known USDT address
        if mint_str == USDT_MAINNET || 
           mint_str == USDT_DEVNET {
            return Some(StablecoinType::USDT);
        }
        
        // It's allowed but not a recognized type
        Some(StablecoinType::OTHER)
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

/// Autonomous Supply Controller - manages algorithmic minting without human intervention
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq)]
pub struct AutonomousSupplyController {
    /// Is initialized
    pub is_initialized: bool,
    /// Mint address for the token
    pub mint: Pubkey,
    /// Price oracle address
    pub price_oracle: Pubkey,
    /// Initial token price (with 6 decimals precision)
    pub initial_price: u64,
    /// Year start token price (with 6 decimals precision)
    pub year_start_price: u64,
    /// Current token price (with 6 decimals precision)
    pub current_price: u64,
    /// Last price update timestamp
    pub last_price_update: i64,
    /// Year start timestamp
    pub year_start_timestamp: i64,
    /// Last minting timestamp
    pub last_mint_timestamp: i64,
    /// Current total supply
    pub current_supply: u64,
    /// Token decimals (from the mint)
    pub token_decimals: u8,
    /// Minimum supply (1B tokens with appropriate token decimals)
    pub min_supply: u64,
    /// High supply threshold (5B tokens with appropriate token decimals)
    pub high_supply_threshold: u64,
    /// Mint authority PDA
    pub mint_authority: Pubkey,
    /// Mint authority PDA bump seed
    pub mint_authority_bump: u8,
    /// Burn treasury PDA
    pub burn_treasury: Pubkey,
    /// Burn treasury PDA bump seed
    pub burn_treasury_bump: u8,
    /// Minimum growth percentage required for minting (in basis points, 500 = 5%)
    pub min_growth_for_mint_bps: u16,
    /// Minimum decline percentage required for burning (in basis points, 500 = 5%)
    pub min_decline_for_burn_bps: u16,
    /// Mint percentage for medium growth (5-10%) (in basis points, 500 = 5%)
    pub medium_growth_mint_rate_bps: u16,
    /// Mint percentage for high growth (>10%) (in basis points, 1000 = 10%)
    pub high_growth_mint_rate_bps: u16,
    /// Burn percentage for medium decline (5-10%) (in basis points, 500 = 5%)
    pub medium_decline_burn_rate_bps: u16,
    /// Burn percentage for high decline (>10%) (in basis points, 1000 = 10%)
    pub high_decline_burn_rate_bps: u16,
    /// High growth threshold (in basis points, 1000 = 10%)
    pub high_growth_threshold_bps: u16,
    /// High decline threshold (in basis points, 1000 = 10%)
    pub high_decline_threshold_bps: u16,
    /// Extreme growth threshold for post-cap rules (in basis points, 3000 = 30%)
    pub extreme_growth_threshold_bps: u16,
    /// Extreme decline threshold for post-cap rules (in basis points, 3000 = 30%)
    pub extreme_decline_threshold_bps: u16,
    /// Post-cap mint rate (in basis points, 200 = 2%)
    pub post_cap_mint_rate_bps: u16,
    /// Post-cap burn rate (in basis points, 200 = 2%)
    pub post_cap_burn_rate_bps: u16,
}

impl AutonomousSupplyController {
    /// Get the account size
    pub fn get_size() -> usize {
        std::mem::size_of::<Self>()
    }
    
    /// Calculate price growth percentage (returns basis points, 100 = 1%)
    /// Returns positive values for growth, negative for decline
    pub fn calculate_price_growth_bps(&self) -> Option<i64> {
        if self.year_start_price == 0 {
            return None; // Prevent division by zero
        }
        
        // Calculate percentage change in basis points (100 = 1%)
        // This can be positive (growth) or negative (decline)
        let current = self.current_price as i128;
        let year_start = self.year_start_price as i128;
        
        // Safely calculate price difference
        let diff = if current >= year_start {
            // Price increased or stayed the same
            current.checked_sub(year_start)?
        } else {
            // Price decreased, result will be negative
            let abs_diff = year_start.checked_sub(current)?;
            // Negate the result, but check for i128::MIN edge case
            if abs_diff == i128::MAX.checked_add(1)? {
                return None; // Would overflow when negated
            }
            -abs_diff
        };
        
        // Calculate percentage: ((current - year_start) / year_start) * 10000
        // First multiply to preserve precision, then divide
        let basis_points = diff.checked_mul(10000)?.checked_div(year_start)?;
        
        // Convert to i64 safely
        if basis_points > i64::MAX as i128 || basis_points < i64::MIN as i128 {
            return None;
        }
        
        Some(basis_points as i64)
    }
    
    /// Determine if minting is allowed and how much to mint
    pub fn calculate_mint_amount(&self) -> Option<u64> {
        // Get annual price growth in basis points
        let growth_bps = self.calculate_price_growth_bps()?;
        
        // Only mint on positive growth
        if growth_bps <= 0 {
            return Some(0);
        }
        
        // For tokens above high supply threshold (5B tokens)
        if self.current_supply >= self.high_supply_threshold {
            // Only mint if growth exceeds extreme threshold (30%)
            if growth_bps >= self.extreme_growth_threshold_bps as i64 {
                // Mint at 2% rate only for extreme growth above 5B supply
                let mint_amount = self.current_supply
                    .checked_mul(self.post_cap_mint_rate_bps as u64)?
                    .checked_div(10000)?;
                return Some(mint_amount);
            }
            // Otherwise no minting for high supply
            return Some(0);
        }
        
        // For normal supply levels (below 5B tokens)
        
        // Less than minimum growth threshold, no minting
        if growth_bps < self.min_growth_for_mint_bps as i64 {
            return Some(0);
        }
        
        // Between min and high growth thresholds, mint at medium rate
        if growth_bps >= self.min_growth_for_mint_bps as i64 && 
           growth_bps < self.high_growth_threshold_bps as i64 {
            let mint_amount = self.current_supply
                .checked_mul(self.medium_growth_mint_rate_bps as u64)?
                .checked_div(10000)?;
            return Some(mint_amount);
        }
        
        // High growth threshold or higher, mint at high rate
        let mint_amount = self.current_supply
            .checked_mul(self.high_growth_mint_rate_bps as u64)?
            .checked_div(10000)?;
        
        return Some(mint_amount);
    }
    
    /// Determine if burning is allowed and how much to burn
    pub fn calculate_burn_amount(&self) -> Option<u64> {
        // Get annual price growth in basis points
        let growth_bps = self.calculate_price_growth_bps()?;
        
        // Only burn on negative growth
        if growth_bps >= 0 {
            return Some(0);
        }
        
        // Convert negative growth to positive decline value safely
        // First ensure the value doesn't exceed u64 range when negated
        if growth_bps == i64::MIN {
            // Special case: i64::MIN cannot be negated without overflow
            return None;
        }
        
        // Safe conversion - we know growth_bps is negative but not MIN
        let decline_bps = (-growth_bps) as u64;
        
        // If already at or near minimum supply (within 5%), no burning allowed
        if self.current_supply <= self.min_supply.checked_mul(105)?.checked_div(100)? {
            return Some(0);
        }
        
        // Apply normal burn rules for supply above minimum
        
        // Less than minimum decline threshold, no burning
        if decline_bps < self.min_decline_for_burn_bps as u64 {
            return Some(0);
        }
        
        // Calculate burn amount based on decline thresholds
        let burn_amount = if decline_bps >= self.high_decline_threshold_bps as u64 {
            // High decline - burn at high rate
            self.current_supply
                .checked_mul(self.high_decline_burn_rate_bps as u64)?
                .checked_div(10000)?
        } else {
            // Medium decline - burn at medium rate
            self.current_supply
                .checked_mul(self.medium_decline_burn_rate_bps as u64)?
                .checked_div(10000)?
        };
        
        // Ensure we don't burn below minimum supply
        let new_total = self.current_supply.checked_sub(burn_amount)?;
        if new_total < self.min_supply {
            // Limit burn to stay at minimum supply
            return self.current_supply.checked_sub(self.min_supply);
        }
        
        return Some(burn_amount);
    }
    
    /// Check if it's time for the annual evaluation
    pub fn is_annual_evaluation_time(&self, current_time: i64) -> bool {
        // Check if a full year (in seconds) has passed since the last year start
        // Use checked_add to avoid potential overflow
        let target_time = match self.year_start_timestamp.checked_add(31_536_000) { // 365 days in seconds
            Some(time) => time,
            None => return false, // Handle overflow gracefully
        };
        current_time >= target_time
    }
    
    /// Check if enough time has passed since last mint
    pub fn can_mint_based_on_time(&self, current_time: i64) -> bool {
        // If never minted before, check against initialization time
        if self.last_mint_timestamp == 0 {
            return self.is_annual_evaluation_time(current_time);
        }
        
        // Otherwise, ensure a full year has passed since last mint
        // Use checked_add to avoid potential overflow
        let target_time = match self.last_mint_timestamp.checked_add(31_536_000) { // 365 days in seconds
            Some(time) => time,
            None => return false, // Handle overflow gracefully
        };
        current_time >= target_time
    }
    
    /// Update the price from oracle
    pub fn update_price(&mut self, new_price: u64, current_time: i64) {
        // No overflow concerns for simple assignments, but good to document
        self.current_price = new_price;
        self.last_price_update = current_time;
    }
    
    /// Start a new year period
    pub fn start_new_year_period(&mut self, current_time: i64) {
        self.year_start_timestamp = current_time;
        self.year_start_price = self.current_price;
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

/// Program upgrade timelock
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq)]
pub struct UpgradeTimelock {
    /// Is initialized
    pub is_initialized: bool,
    /// Current upgrade authority
    pub upgrade_authority: Pubkey,
    /// Proposed upgrade time
    pub proposed_upgrade_time: i64,
    /// Upgrade timelock duration in seconds (default 7 days)
    pub timelock_duration: i64,
    /// Is upgrade pending
    pub is_upgrade_pending: bool,
}

impl UpgradeTimelock {
    /// Get the size of the upgrade timelock account
    pub fn get_size() -> usize {
        std::mem::size_of::<Self>()
    }
} 