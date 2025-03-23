#[cfg(test)]
mod tests {
    use solana_program_test::*;
    use solana_sdk::{
        signature::{Keypair, Signer},
        transaction::Transaction,
        pubkey::Pubkey,
    };
    use vcoin_program::id;

    #[tokio::test]
    async fn test_program_initialization() {
        // Create program test environment
        let program_id = id();
        let program_test = ProgramTest::new(
            "vcoin_program",
            program_id,
            processor!(vcoin_program::entrypoint::process_instruction),
        );

        // Start the test environment
        let (_, _, _) = program_test.start().await;

        // Check that program is working
        assert_eq!(program_id, vcoin_program::id());
        println!("Program ID: {}", program_id);
        println!("Test initialized successfully!");
    }
} 