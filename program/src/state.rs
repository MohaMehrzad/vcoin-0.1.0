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

/// Represents a supported stablecoin with additional metadata
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq)]
pub struct SupportedStablecoin {
    /// Stablecoin mint address
    pub mint: Pubkey,
    /// Stablecoin type
    pub stablecoin_type: StablecoinType,
    /// Whether this stablecoin is active
    pub is_active: bool,
    /// Timestamp when added
    pub added_at: i64,
    /// Custom name if provided
    pub name: Option<String>,
    /// Decimal places of the stablecoin
    pub decimals: u8,
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
    
    /// Add allowed stablecoin with more metadata
    pub fn add_stablecoin(&mut self, stablecoin: SupportedStablecoin) -> Result<(), ProgramError> {
        // Check if already exists
        if self.allowed_stablecoins.iter().any(|coin| coin == &stablecoin.mint) {
            return Err(ProgramError::InvalidArgument);
        }
        
        // Enforce limit
        if self.allowed_stablecoins.len() >= 10 {
            return Err(ProgramError::InvalidArgument);
        }
        
        // Add stablecoin
        self.allowed_stablecoins.push(stablecoin.mint);
        
        Ok(())
    }
    
    /// Check if a stablecoin is allowed
    pub fn is_stablecoin_allowed(&self, stablecoin_mint: &Pubkey) -> bool {
        self.allowed_stablecoins.contains(stablecoin_mint)
    }
    
    /// Get stablecoin type with fallback logic
    pub fn get_stablecoin_type_dynamic(&self, stablecoin_mint: &Pubkey) -> Option<StablecoinType> {
        // First check if stablecoin is allowed
        if !self.is_stablecoin_allowed(stablecoin_mint) {
            return None;
        }
        
        // Get the mint string for comparison
        let mint_str = stablecoin_mint.to_string();
        
        // Known USDC addresses across networks
        let usdc_addresses = [
            // Mainnet
            "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            // Devnet
            "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
            // Testnet
            "CpMah17kQEL2wqyMKt3mZBdTnZbkbfx4nqmQMFDP5vwp",
        ];
        
        // Known USDT addresses across networks
        let usdt_addresses = [
            // Mainnet
            "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
            // Devnet
            "DAwBSXe6w9g37wdE2tCrFbho3QHKZi4PjuBytQCULap2",
            // Testnet 
            "BQcdHdAQW1hczDbBi9hiegXAR7A98Q9jx3X3iBBBDiq4",
        ];
        
        // Check if it's a known USDC address
        if usdc_addresses.contains(&mint_str.as_str()) {
            return Some(StablecoinType::USDC);
        }
        
        // Check if it's a known USDT address
        if usdt_addresses.contains(&mint_str.as_str()) {
            return Some(StablecoinType::USDT);
        }
        
        // If not a known address, return OTHER type
        Some(StablecoinType::OTHER)
    }
    
    /// Add a raw stablecoin Pubkey (compatibility method)
    pub fn add_stablecoin_raw(&mut self, stablecoin_mint: Pubkey) -> Result<(), ProgramError> {
        // Check if already exists
        if self.allowed_stablecoins.iter().any(|coin| coin == &stablecoin_mint) {
            return Err(ProgramError::InvalidArgument);
        }
        
        // Enforce limit
        if self.allowed_stablecoins.len() >= 10 {
            return Err(ProgramError::InvalidArgument);
        }
        
        // Add stablecoin
        self.allowed_stablecoins.push(stablecoin_mint);
        
        Ok(())
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

impl VestingBeneficiary {
    /// Calculate the amount of tokens that should be released based on current time
    pub fn calculate_released_amount(&mut self, current_time: i64, release_interval: i64) -> Result<u64, ProgramError> {
        // Calculate releasable amount based on elapsed time and release interval
        let elapsed_intervals = if release_interval > 0 {
            current_time / release_interval
        } else {
            return Err(ProgramError::InvalidArgument);
        };
        
        // Calculate amount per interval
        let total_intervals = release_interval as u64;
        let amount_per_interval = self.total_amount.checked_div(total_intervals)
            .ok_or(ProgramError::ArithmeticOverflow)?;
            
        // Calculate total releasable amount
        let total_releasable = amount_per_interval.checked_mul(elapsed_intervals as u64)
            .ok_or(ProgramError::ArithmeticOverflow)?;
            
        // Don't release more than total amount
        let capped_releasable = std::cmp::min(total_releasable, self.total_amount);
        
        // Calculate unreleased amount
        let unreleased = capped_releasable.checked_sub(self.released_amount)
            .ok_or(ProgramError::ArithmeticOverflow)?;
            
        Ok(unreleased)
    }
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
    /// Last updated timestamp
    pub last_updated_timestamp: i64,
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

/// Program upgrade states
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq)]
pub enum UpgradeState {
    /// No upgrade proposed
    None,
    /// Upgrade proposed, waiting for timelock
    Proposed { proposal_time: i64 },
    /// Upgrade executed
    Executed { execution_time: i64 },
    /// Upgrades disabled
    Disabled,
}

/// Emergency program state
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq)]
pub struct EmergencyState {
    /// Is initialized
    pub is_initialized: bool,
    /// Authority with emergency powers
    pub emergency_authority: Pubkey,
    /// Main program authority (as backup)
    pub program_authority: Pubkey,
    /// Current emergency state
    pub emergency_mode: EmergencyMode,
    /// Timestamp when emergency mode was activated
    pub emergency_activated_at: i64,
    /// Reason for emergency if provided
    pub emergency_reason: Option<String>,
    /// List of previously paused functions for tracking
    pub pause_history: Vec<PauseRecord>,
}

/// Emergency modes for the program
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq)]
pub enum EmergencyMode {
    /// Normal operations
    Normal,
    /// Paused operations (only recovery functions allowed)
    Paused,
    /// Critical failure mode (only specific recovery functions)
    Critical,
}

/// Record of a pause event
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq)]
pub struct PauseRecord {
    /// Timestamp when pause occurred
    pub paused_at: i64,
    /// Timestamp when operations resumed (if applicable)
    pub resumed_at: Option<i64>,
    /// Reason for the pause if provided
    pub reason: Option<String>,
    /// Authority that initiated the pause
    pub paused_by: Pubkey,
}

impl EmergencyState {
    /// Create a new emergency state
    pub fn new(emergency_authority: Pubkey, program_authority: Pubkey) -> Self {
        Self {
            is_initialized: true,
            emergency_authority,
            program_authority,
            emergency_mode: EmergencyMode::Normal,
            emergency_activated_at: 0,
            emergency_reason: None,
            pause_history: Vec::new(),
        }
    }
    
    /// Check if operations are paused
    pub fn is_paused(&self) -> bool {
        match self.emergency_mode {
            EmergencyMode::Normal => false,
            _ => true,
        }
    }
    
    /// Pause operations
    pub fn pause(&mut self, authority: &Pubkey, reason: Option<String>, timestamp: i64) -> Result<(), ProgramError> {
        // Verify authority
        if authority != &self.emergency_authority && authority != &self.program_authority {
            return Err(ProgramError::InvalidArgument);
        }
        
        // Set emergency mode
        self.emergency_mode = EmergencyMode::Paused;
        self.emergency_activated_at = timestamp;
        self.emergency_reason = reason.clone();
        
        // Record pause event
        self.pause_history.push(PauseRecord {
            paused_at: timestamp,
            resumed_at: None,
            reason,
            paused_by: *authority,
        });
        
        Ok(())
    }
    
    /// Resume operations
    pub fn resume(&mut self, authority: &Pubkey, timestamp: i64) -> Result<(), ProgramError> {
        // Verify authority
        if authority != &self.emergency_authority && authority != &self.program_authority {
            return Err(ProgramError::InvalidArgument);
        }
        
        // Set normal mode
        self.emergency_mode = EmergencyMode::Normal;
        
        // Update the latest pause record if any
        if let Some(last_record) = self.pause_history.last_mut() {
            if last_record.resumed_at.is_none() {
                last_record.resumed_at = Some(timestamp);
            }
        }
        
        // Clear emergency reason
        self.emergency_reason = None;
        
        Ok(())
    }
    
    /// Calculate required space for the emergency state
    pub fn get_space(history_capacity: usize) -> usize {
        // Base size excluding Vec<PauseRecord>
        let base_size = std::mem::size_of::<Self>() - std::mem::size_of::<Vec<PauseRecord>>();
        
        // Add space for pause records
        let record_size = std::mem::size_of::<PauseRecord>();
        let history_size = record_size.checked_mul(history_capacity)
            .expect("Calculation error in EmergencyState::get_space");
        
        base_size.checked_add(history_size)
            .expect("Calculation error in EmergencyState::get_space")
    }
}

/// Oracle types supported by the protocol
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq)]
pub enum OracleType {
    /// Pyth Network Oracle
    Pyth,
    /// Switchboard Oracle
    Switchboard,
    /// Chainlink Oracle (future support)
    Chainlink,
    /// Custom Oracle
    Custom,
}

/// Oracle source configuration
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq)]
pub struct OracleSource {
    /// Oracle public key
    pub pubkey: Pubkey,
    /// Oracle type
    pub oracle_type: OracleType,
    /// Whether this oracle is active
    pub is_active: bool,
    /// Weight for consensus calculation (0-100)
    pub weight: u8,
    /// Maximum allowed price deviation percentage from consensus (in basis points)
    pub max_deviation_bps: u16,
    /// Maximum allowed staleness in seconds
    pub max_staleness_seconds: u32,
    /// Last valid price in USD (with 6 decimals precision)
    pub last_valid_price: u64,
    /// Last update timestamp
    pub last_update_timestamp: i64,
    /// Consecutive failures
    pub consecutive_failures: u8,
    /// Whether this is a required oracle (must be present for critical operations)
    pub is_required: bool,
}

/// Oracle price data from multiple sources
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq)]
pub struct OracleConsensusResult {
    /// Final price in USD (with 6 decimals precision)
    pub price: u64,
    /// Confidence interval in USD (with 6 decimals precision)
    pub confidence: u64,
    /// Timestamp of the consensus
    pub timestamp: i64,
    /// Number of oracles that contributed to the consensus
    pub contributing_oracles: u8,
    /// Circuit breaker active
    pub circuit_breaker_active: bool,
    /// Reason for circuit breaker activation (if any)
    pub circuit_breaker_reason: Option<String>,
    /// Whether the price is based on fallback mechanism
    pub is_fallback_price: bool,
    /// Maximum deviation between oracles (in basis points)
    pub max_deviation_bps: u16,
}

/// Oracle health status for monitoring
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq)]
pub struct OracleHealthStatus {
    /// Last health check timestamp
    pub last_checked: i64,
    /// Overall health score (0-100)
    pub health_score: u8,
    /// Number of active oracles
    pub active_oracles: u8,
    /// Number of available oracles
    pub total_oracles: u8,
    /// Whether the system is operating in degraded mode
    pub is_degraded: bool,
    /// Maximum staleness across all active oracles (in seconds)
    pub max_staleness: u32,
    /// Average price deviation between oracles (in basis points)
    pub avg_deviation_bps: u16,
}

/// Multi-Oracle Controller for price feed management
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq)]
pub struct MultiOracleController {
    /// Is initialized
    pub is_initialized: bool,
    /// Authority that can manage oracles
    pub authority: Pubkey,
    /// Asset ID this controller tracks (e.g., "BTC/USD")
    pub asset_id: String,
    /// Oracle sources
    pub oracle_sources: Vec<OracleSource>,
    /// Minimum required oracles for consensus
    pub min_required_oracles: u8,
    /// Whether circuit breaker is currently active
    pub circuit_breaker_active: bool,
    /// Circuit breaker activation timestamp
    pub circuit_breaker_activated_at: i64,
    /// Circuit breaker reason if active
    pub circuit_breaker_reason: Option<String>,
    /// Circuit breaker cool-down period in seconds
    pub circuit_breaker_cooldown: u32,
    /// Last valid consensus result
    pub last_consensus: OracleConsensusResult,
    /// Current health status
    pub health: OracleHealthStatus,
    /// Emergency manually set price (for extreme situations)
    pub emergency_price: Option<u64>,
    /// Timestamp when emergency price was set
    pub emergency_price_timestamp: i64,
    /// Emergency price expiration in seconds
    pub emergency_price_expiration: u32,
}

impl MultiOracleController {
    /// Calculate space needed for the MultiOracleController with the given number of oracle sources
    pub fn get_size(oracle_sources_count: usize) -> usize {
        // Base size excluding Vec<OracleSource>
        let base_size = std::mem::size_of::<Self>() - std::mem::size_of::<Vec<OracleSource>>();
        
        // Add space for oracle sources
        let source_size = std::mem::size_of::<OracleSource>();
        let sources_size = source_size.checked_mul(oracle_sources_count)
            .expect("Calculation error in MultiOracleController::get_size");
        
        base_size.checked_add(sources_size)
            .expect("Calculation error in MultiOracleController::get_size")
    }
    
    /// Create a new oracle controller
    pub fn new(
        authority: Pubkey, 
        asset_id: String,
        min_required_oracles: u8,
    ) -> Self {
        Self {
            is_initialized: true,
            authority,
            asset_id,
            oracle_sources: Vec::new(),
            min_required_oracles,
            circuit_breaker_active: false,
            circuit_breaker_activated_at: 0,
            circuit_breaker_reason: None,
            circuit_breaker_cooldown: 3600, // 1 hour default
            last_consensus: OracleConsensusResult {
                price: 0,
                confidence: 0,
                timestamp: 0,
                contributing_oracles: 0,
                circuit_breaker_active: false,
                circuit_breaker_reason: None,
                is_fallback_price: false,
                max_deviation_bps: 0,
            },
            health: OracleHealthStatus {
                last_checked: 0,
                health_score: 100, // Start with perfect health
                active_oracles: 0,
                total_oracles: 0,
                is_degraded: false,
                max_staleness: 0,
                avg_deviation_bps: 0,
            },
            emergency_price: None,
            emergency_price_timestamp: 0,
            emergency_price_expiration: 86400, // 24 hours default
        }
    }
    
    /// Check if emergency price is valid
    pub fn is_emergency_price_valid(&self, current_time: i64) -> bool {
        if let Some(_) = self.emergency_price {
            let expiration_time = self.emergency_price_timestamp
                .checked_add(self.emergency_price_expiration as i64)
                .unwrap_or(i64::MAX);
            
            current_time < expiration_time
        } else {
            false
        }
    }
    
    /// Get emergency price if valid
    pub fn get_emergency_price(&self, current_time: i64) -> Option<u64> {
        if self.is_emergency_price_valid(current_time) {
            self.emergency_price
        } else {
            None
        }
    }
    
    /// Add a new oracle source
    pub fn add_oracle_source(&mut self, oracle_source: OracleSource) -> Result<(), ProgramError> {
        // Check if oracle already exists
        if self.oracle_sources.iter().any(|source| source.pubkey == oracle_source.pubkey) {
            return Err(ProgramError::InvalidArgument);
        }
        
        // Add the oracle
        self.oracle_sources.push(oracle_source);
        
        // Update health status
        self.health.total_oracles = self.oracle_sources.len() as u8;
        if self.oracle_sources.last().unwrap().is_active {
            self.health.active_oracles += 1;
        }
        
        Ok(())
    }
    
    /// Update an existing oracle source
    pub fn update_oracle_source(
        &mut self, 
        pubkey: &Pubkey, 
        is_active: Option<bool>,
        weight: Option<u8>,
        max_deviation_bps: Option<u16>,
        max_staleness_seconds: Option<u32>,
        is_required: Option<bool>,
    ) -> Result<(), ProgramError> {
        // Find the oracle
        let oracle_idx = self.oracle_sources.iter().position(|source| &source.pubkey == pubkey)
            .ok_or(ProgramError::InvalidArgument)?;
        
        // Update fields if provided
        if let Some(is_active) = is_active {
            // Update active oracles count
            if is_active != self.oracle_sources[oracle_idx].is_active {
                if is_active {
                    self.health.active_oracles += 1;
                } else {
                    self.health.active_oracles = self.health.active_oracles.saturating_sub(1);
                }
            }
            self.oracle_sources[oracle_idx].is_active = is_active;
        }
        
        if let Some(weight) = weight {
            // Ensure weight is within range
            if weight > 100 {
                return Err(ProgramError::InvalidArgument);
            }
            self.oracle_sources[oracle_idx].weight = weight;
        }
        
        if let Some(max_deviation_bps) = max_deviation_bps {
            self.oracle_sources[oracle_idx].max_deviation_bps = max_deviation_bps;
        }
        
        if let Some(max_staleness_seconds) = max_staleness_seconds {
            self.oracle_sources[oracle_idx].max_staleness_seconds = max_staleness_seconds;
        }
        
        if let Some(is_required) = is_required {
            self.oracle_sources[oracle_idx].is_required = is_required;
        }
        
        Ok(())
    }
    
    /// Activate circuit breaker
    pub fn activate_circuit_breaker(&mut self, reason: String, current_time: i64) {
        self.circuit_breaker_active = true;
        self.circuit_breaker_activated_at = current_time;
        self.circuit_breaker_reason = Some(reason.clone());
        
        // Update last consensus
        self.last_consensus.circuit_breaker_active = true;
        self.last_consensus.circuit_breaker_reason = Some(reason);
        
        // Mark system as degraded
        self.health.is_degraded = true;
    }
    
    /// Deactivate circuit breaker
    pub fn deactivate_circuit_breaker(&mut self) {
        self.circuit_breaker_active = false;
        self.circuit_breaker_reason = None;
        
        // Update last consensus
        self.last_consensus.circuit_breaker_active = false;
        self.last_consensus.circuit_breaker_reason = None;
        
        // Restore health if no other issues
        if self.health.active_oracles >= self.min_required_oracles {
            self.health.is_degraded = false;
        }
    }
    
    /// Check if circuit breaker cooldown period has passed
    pub fn has_circuit_breaker_cooldown_passed(&self, current_time: i64) -> bool {
        if !self.circuit_breaker_active {
            return true;
        }
        
        let cooldown_end = self.circuit_breaker_activated_at
            .checked_add(self.circuit_breaker_cooldown as i64)
            .unwrap_or(i64::MAX);
        
        current_time >= cooldown_end
    }
    
    /// Record a new price from an oracle
    pub fn record_oracle_price(
        &mut self, 
        oracle_pubkey: &Pubkey, 
        price: u64, 
        timestamp: i64,
    ) -> Result<(), ProgramError> {
        // Find the oracle
        let oracle_idx = self.oracle_sources.iter().position(|source| &source.pubkey == oracle_pubkey)
            .ok_or(ProgramError::InvalidArgument)?;
        
        // Update the price data
        let oracle = &mut self.oracle_sources[oracle_idx];
        oracle.last_valid_price = price;
        oracle.last_update_timestamp = timestamp;
        oracle.consecutive_failures = 0;
        
        Ok(())
    }
    
    /// Record an oracle failure
    pub fn record_oracle_failure(&mut self, oracle_pubkey: &Pubkey) -> Result<(), ProgramError> {
        // Find the oracle
        let oracle_idx = self.oracle_sources.iter().position(|source| &source.pubkey == oracle_pubkey)
            .ok_or(ProgramError::InvalidArgument)?;
        
        // Update failure count
        self.oracle_sources[oracle_idx].consecutive_failures += 1;
        
        // If too many consecutive failures, deactivate
        if self.oracle_sources[oracle_idx].consecutive_failures >= 5 {
            if self.oracle_sources[oracle_idx].is_active {
                self.oracle_sources[oracle_idx].is_active = false;
                self.health.active_oracles = self.health.active_oracles.saturating_sub(1);
                
                // Check if we're below minimum required oracles
                if self.health.active_oracles < self.min_required_oracles {
                    self.health.is_degraded = true;
                }
            }
        }
        
        Ok(())
    }
} 