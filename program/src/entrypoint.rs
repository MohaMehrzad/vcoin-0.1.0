use solana_program::{
    account_info::AccountInfo,
    entrypoint,
    entrypoint::ProgramResult,
    pubkey::Pubkey,
    msg,
};

use crate::processor::Processor;

// Declare and export the program's entrypoint
#[cfg(not(feature = "no-entrypoint"))]
entrypoint!(process_instruction);

// Program entrypoint's implementation
pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    msg!("VCoin Program entrypoint");
    
    // Call the processor
    Processor::process(program_id, accounts, instruction_data)
} 