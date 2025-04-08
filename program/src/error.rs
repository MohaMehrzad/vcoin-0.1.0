use num_derive::FromPrimitive;
use solana_program::{decode_error::DecodeError, program_error::ProgramError};
use thiserror::Error;

/// Errors that may be returned by the VCoin program.
#[derive(Clone, Debug, Eq, Error, FromPrimitive, PartialEq)]
pub enum VCoinError {
    /// Invalid instruction
    #[error("Invalid instruction")]
    InvalidInstruction,

    /// Invalid instruction data provided
    #[error("Invalid instruction data")]
    InvalidInstructionData,

    /// Not rent exempt
    #[error("Not rent exempt")]
    NotRentExempt,

    /// Already initialized
    #[error("Already initialized")]
    AlreadyInitialized,

    /// Not initialized
    #[error("Not initialized")]
    NotInitialized,

    /// Unauthorized
    #[error("Unauthorized")]
    Unauthorized,

    /// Invalid account owner
    #[error("Invalid account owner")]
    InvalidAccountOwner,

    /// Invalid mint
    #[error("Invalid mint")]
    InvalidMint,

    /// Invalid treasury
    #[error("Invalid treasury")]
    InvalidTreasury,

    /// Calculation error
    #[error("Calculation error")]
    CalculationError,

    /// Presale not started
    #[error("Presale not started")]
    PresaleNotStarted,

    /// Presale not active
    #[error("Presale not active")]
    PresaleNotActive,

    /// Presale ended
    #[error("Presale ended")]
    PresaleEnded,

    /// Presale already ended
    #[error("Presale already ended")]
    PresaleAlreadyEnded,

    /// Hard cap reached
    #[error("Hard cap reached")]
    HardCapReached,

    /// Below minimum purchase
    #[error("Below minimum purchase")]
    BelowMinimumPurchase,

    /// Exceeds maximum purchase
    #[error("Exceeds maximum purchase")]
    ExceedsMaximumPurchase,

    /// Invalid presale parameters
    #[error("Invalid presale parameters")]
    InvalidPresaleParameters,

    /// Soft cap too low
    #[error("Soft cap too low")]
    SoftCapTooLow,

    /// Invalid vesting parameters
    #[error("Invalid vesting parameters")]
    InvalidVestingParameters,

    /// Vesting not started
    #[error("Vesting not started")]
    VestingNotStarted,

    /// No tokens due
    #[error("No tokens due")]
    NoTokensDue,

    /// Beneficiary not found
    #[error("Beneficiary not found")]
    BeneficiaryNotFound,

    /// Beneficiary limit reached
    #[error("Beneficiary limit reached")]
    BeneficiaryLimitReached,

    /// Insufficient tokens
    #[error("Insufficient tokens")]
    InsufficientTokens,

    /// Invalid token metadata
    #[error("Invalid token metadata")]
    InvalidTokenMetadata,

    /// Transfer fee not supported
    #[error("Transfer fee not supported")]
    TransferFeeNotSupported,

    /// Exceeds maximum fee
    #[error("Exceeds maximum fee of 10%")]
    ExceedsMaximumFee,

    /// Beneficiary already exists
    #[error("Beneficiary already exists")]
    BeneficiaryAlreadyExists,

    /// Invalid oracle account
    #[error("Invalid oracle account")]
    InvalidOracleAccount,

    /// Invalid mint authority
    #[error("Invalid mint authority")]
    InvalidMintAuthority,

    /// Too early for minting
    #[error("Too early for minting")]
    TooEarlyForMinting,

    /// Too early for burning
    #[error("Too early for burning")]
    TooEarlyForBurning,

    /// Exceeds maximum supply
    #[error("Exceeds maximum supply")]
    ExceedsMaximumSupply,

    /// Invalid supply parameters
    #[error("Invalid supply parameters")]
    InvalidSupplyParameters,

    /// Price manipulation detected
    #[error("Price manipulation detected")]
    PriceManipulationDetected,

    /// Stale oracle data
    #[error("Stale oracle data")]
    StaleOracleData,

    /// Moderately stale oracle data (warning level)
    #[error("Moderately stale oracle data")]
    ModeratelyStaleOracleData,

    /// Critically stale oracle data (error level)
    #[error("Critically stale oracle data")]
    CriticallyStaleOracleData,

    /// Invalid program account
    #[error("Invalid program account")]
    InvalidProgramAccount,

    /// Invalid BPF loader program
    #[error("Invalid BPF loader program")]
    InvalidBPFLoaderProgram,

    /// Invalid oracle data
    #[error("Invalid oracle data")]
    InvalidOracleData,

    /// Invalid oracle provider
    #[error("Invalid oracle provider")]
    InvalidOracleProvider,

    /// Invalid burn treasury
    #[error("Invalid burn treasury")]
    InvalidBurnTreasury,

    /// Unauthorized burn source
    #[error("Unauthorized burn source")]
    UnauthorizedBurnSource,

    /// Reentrancy detected
    #[error("Reentrancy detected")]
    ReentrancyDetected,

    /// Excessive price change
    #[error("Excessive price change")]
    ExcessivePriceChange,

    /// Low confidence price data
    #[error("Low confidence price data")]
    LowConfidencePriceData,

    /// Invalid PDA derivation
    #[error("Invalid PDA derivation")]
    InvalidPdaDerivation,

    /// Invalid mint configuration
    #[error("Invalid mint configuration")]
    InvalidMintConfiguration,

    /// Oracle price deviation
    #[error("Oracle price deviation exceeds threshold")]
    OraclePriceDeviation,

    /// Invalid fee amount
    #[error("Invalid fee amount - exceeds 1% maximum (100 basis points)")]
    InvalidFeeAmount,

    /// Token already launched
    #[error("Token has already been launched")]
    TokenAlreadyLaunched,

    /// Insufficient oracle consensus
    #[error("Insufficient oracle consensus")]
    InsufficientOracleConsensus,

    /// Circuit breaker active
    #[error("Circuit breaker active")]
    CircuitBreakerActive,

    /// Excessive price change detected
    #[error("Excessive price change detected")]
    ExcessivePriceChangeDetected,

    /// Invalid price oracle parameters
    #[error("Invalid price oracle parameters")]
    InvalidPriceOracleParams,

    /// Oracle system in degraded mode
    #[error("Oracle system in degraded mode")]
    OracleSystemDegraded,

    /// Oracle data not found
    #[error("Oracle data not found")]
    OracleDataNotFound,

    /// No consensus between oracles
    #[error("No consensus between oracles")]
    NoOracleConsensus,
}

impl From<VCoinError> for ProgramError {
    fn from(e: VCoinError) -> Self {
        ProgramError::Custom(e as u32)
    }
}

impl<T> DecodeError<T> for VCoinError {
    fn type_of() -> &'static str {
        "VCoinError"
    }
} 