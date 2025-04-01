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
    /// List of unique buyer public keys
    pub buyer_pubkeys: Vec<Pubkey>,
}

impl PresaleState {
    /// Get the size of the presale state
    pub fn get_size() -> usize {
        // Base size excluding Vec<Pubkey>
        let base_size = std::mem::size_of::<Self>() - std::mem::size_of::<Vec<Pubkey>>();
        
        // Allow for 100 unique buyers by default
        let vec_size = std::mem::size_of::<Pubkey>() * 100;
        
        base_size + vec_size
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
    /// Initial maximum supply (1B tokens with decimals)
    pub initial_max_supply: u64,
    /// Absolute maximum supply (5B tokens with decimals)
    pub absolute_max_supply: u64,
    /// Mint authority PDA
    pub mint_authority: Pubkey,
    /// Mint authority PDA bump seed
    pub mint_authority_bump: u8,
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
            return None;
        }
        
        // Calculate percentage change in basis points (100 = 1%)
        // This can be positive (growth) or negative (decline)
        let current = self.current_price as i128;
        let year_start = self.year_start_price as i128;
        
        // ((current - year_start) / year_start) * 10000
        let change = ((current - year_start) * 10000) / year_start;
        
        // Convert to i64 safely
        if change > i64::MAX as i128 || change < i64::MIN as i128 {
            return None;
        }
        
        Some(change as i64)
    }
    
    /// Determine if minting is allowed and how much to mint
    pub fn calculate_mint_amount(&self) -> Option<u64> {
        // Get annual price growth in basis points
        let growth_bps = self.calculate_price_growth_bps()?;
        
        // Only mint on positive growth
        if growth_bps <= 0 {
            return Some(0);
        }
        
        // If we're already at absolute maximum supply, no minting allowed
        if self.current_supply >= self.absolute_max_supply {
            return Some(0);
        }
        
        // Supply-dependent rules
        if self.current_supply < self.absolute_max_supply { // Less than 5B tokens
            // Less than 5% growth, no minting
            if growth_bps < 500 {
                return Some(0);
            }
            
            // Between 5-9% growth, mint 5% of current supply
            if growth_bps >= 500 && growth_bps < 1000 {
                let mint_amount = self.current_supply.checked_mul(500)?.checked_div(10000)?;
                
                // Check if adding mint_amount would exceed 5B
                let new_total = self.current_supply.checked_add(mint_amount)?;
                if new_total > self.absolute_max_supply {
                    // Limit to max supply
                    return self.absolute_max_supply.checked_sub(self.current_supply);
                }
                
                return Some(mint_amount);
            }
            
            // 10% or higher growth, mint 10% of current supply
            let mint_amount = self.current_supply.checked_mul(1000)?.checked_div(10000)?;
            
            // Check if adding mint_amount would exceed 5B
            let new_total = self.current_supply.checked_add(mint_amount)?;
            if new_total > self.absolute_max_supply {
                // Limit to max supply
                return self.absolute_max_supply.checked_sub(self.current_supply);
            }
            
            return Some(mint_amount);
        }
        
        // After 5B tokens, only mint 2% if growth is over 30%
        if growth_bps >= 3000 {
            let mint_amount = self.current_supply.checked_mul(200)?.checked_div(10000)?;
            return Some(mint_amount);
        }
        
        // Default case - no minting
        Some(0)
    }
    
    /// Determine if burning is allowed and how much to burn
    pub fn calculate_burn_amount(&self) -> Option<u64> {
        // Get annual price growth in basis points
        let growth_bps = self.calculate_price_growth_bps()?;
        
        // Only burn on negative growth
        if growth_bps >= 0 {
            return Some(0);
        }
        
        // Convert to absolute value for easier comparison
        let decline_bps = (-growth_bps) as u64;
        
        // Set absolute minimum supply to 1B tokens with decimals
        let min_supply = 1_000_000_000_000_000_000u64; // 1B with 9 decimals
        
        // If already at or near minimum supply (within 5%), no more burning
        if self.current_supply <= min_supply.checked_mul(105)?.checked_div(100)? {
            return Some(0);
        }
        
        // Supply-dependent rules
        if self.current_supply < self.absolute_max_supply { // Less than 5B tokens
            // Less than 5% decline, no burning
            if decline_bps < 500 {
                return Some(0);
            }
            
            // Between 5-9% decline, burn 5% of current supply
            if decline_bps >= 500 && decline_bps < 1000 {
                let burn_amount = self.current_supply.checked_mul(500)?.checked_div(10000)?;
                
                // Ensure we don't burn below minimum supply
                let new_total = self.current_supply.checked_sub(burn_amount)?;
                if new_total < min_supply {
                    // Limit burn to maintain minimum supply or cancel if too close
                    if self.current_supply <= min_supply.checked_mul(105)?.checked_div(100)? {
                        return Some(0);
                    }
                    return self.current_supply.checked_sub(min_supply);
                }
                
                return Some(burn_amount);
            }
            
            // 10% or higher decline, burn 10% of current supply
            let burn_amount = self.current_supply.checked_mul(1000)?.checked_div(10000)?;
            
            // Ensure we don't burn below minimum supply
            let new_total = self.current_supply.checked_sub(burn_amount)?;
            if new_total < min_supply {
                // Limit burn to maintain minimum supply or cancel if too close
                if self.current_supply <= min_supply.checked_mul(105)?.checked_div(100)? {
                    return Some(0);
                }
                return self.current_supply.checked_sub(min_supply);
            }
            
            return Some(burn_amount);
        }
        
        // After 5B tokens, only burn 2% if decline is over 30%
        if decline_bps >= 3000 {
            let burn_amount = self.current_supply.checked_mul(200)?.checked_div(10000)?;
            
            // Ensure we don't burn below minimum supply
            let new_total = self.current_supply.checked_sub(burn_amount)?;
            if new_total < min_supply {
                // Limit burn to maintain minimum supply or cancel if too close
                if self.current_supply <= min_supply.checked_mul(105)?.checked_div(100)? {
                    return Some(0);
                }
                return self.current_supply.checked_sub(min_supply);
            }
            
            return Some(burn_amount);
        }
        
        // Default case - no burning
        Some(0)
    }
    
    /// Check if it's time for the annual evaluation
    pub fn is_annual_evaluation_time(&self, current_time: i64) -> bool {
        // Check if a full year (in seconds) has passed since the last year start
        current_time >= self.year_start_timestamp + 31_536_000 // 365 days in seconds
    }
    
    /// Check if enough time has passed since last mint
    pub fn can_mint_based_on_time(&self, current_time: i64) -> bool {
        // If never minted before, check against initialization time
        if self.last_mint_timestamp == 0 {
            return self.is_annual_evaluation_time(current_time);
        }
        
        // Otherwise, ensure a full year has passed since last mint
        current_time >= self.last_mint_timestamp + 31_536_000 // 365 days in seconds
    }
    
    /// Update the price from oracle
    pub fn update_price(&mut self, new_price: u64, current_time: i64) {
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