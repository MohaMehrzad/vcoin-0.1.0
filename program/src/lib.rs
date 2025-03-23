// Export modules
pub mod entrypoint;
pub mod error;
pub mod instruction;
pub mod processor;
pub mod state;

// Re-export for convenience
pub use instruction::*;
pub use error::*;

// Program ID - using a known valid ID format
solana_program::declare_id!("9ZskGH6R3iVYPeQMf1XiANgDZQHNMUvZgAC8Xxxj7zae"); 