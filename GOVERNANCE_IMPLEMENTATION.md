# VCoin Governance Implementation

## Overview

This document details the implementation of a council-based governance system for VCoin. The governance system provides decentralized control over critical protocol operations including program upgrades, parameter changes, and token operations.

## Key Features

- **Multi-signature approval**: Requires approval from a council of members
- **Time-locked upgrades**: All changes require waiting periods before execution
- **Council voting mechanism**: Democratic voting system with configurable thresholds
- **Transparent logging**: All governance actions recorded on-chain
- **Proposal lifecycle management**: Full tracking of proposal creation, voting, and execution

## Modified Files

| File                    | Description of Changes                                      |
|-------------------------|-------------------------------------------------------------|
| program/src/state.rs    | Added governance state structures and helper methods        |
| program/src/error.rs    | Added governance-related error types                        |
| program/src/instruction.rs | Added governance instruction definitions                 |
| program/src/processor.rs | Added governance instruction processing logic              |

## Detailed Changes

### 1. program/src/state.rs

Added the following structures and constants:

- `MAX_COUNCIL_MEMBERS` (constant): Limits council size to 9 members
- `MAX_PROPOSALS` (constant): Limits active proposals to 20
- `ProposalType` (enum): Defines possible proposal types (program upgrades, parameter changes, etc.)
- `ProposalStatus` (enum): Tracks proposal lifecycle (active, approved, rejected, executed, cancelled)
- `Vote` (enum): Defines vote types (For, Against, Abstain)
- `Proposal` (struct): Stores proposal details and voting results
- `VoteRecord` (struct): Records individual council member votes
- `GovernanceConfig` (struct): Stores governance parameters (voting duration, quorum, etc.)
- `CouncilState` (struct): Main state structure for the governance system

Added the following methods:

- `CouncilState::get_size()`: Calculates required account size with safety buffer
- `CouncilState::is_council_member()`: Authorization check for council membership
- `CouncilState::add_proposal()`: Creates new proposals with input validation
- `CouncilState::cast_vote()`: Records votes with duplicate prevention
- `CouncilState::find_proposal()/find_proposal_mut()`: Convenience methods for proposal lookup
- `CouncilState::check_proposal_status()`: Determines proposal outcomes based on votes
- `CouncilState::add_council_member()`: Adds council members with validation
- `CouncilState::remove_council_member()`: Removes council members with validation

### 2. program/src/error.rs

Added the following error types:

- `InvalidProposalStatus`: For operations on proposals with incorrect status
- `AlreadyVoted`: Prevents duplicate votes from council members
- `ExpiredDeadline`: For operations after voting deadlines
- `InstructionExecutionError`: For failures during proposal execution

### 3. program/src/instruction.rs

Added the following instruction types:

- `InitializeGovernance`: Sets up the governance system with initial council members
- `CreateProposal`: Creates new governance proposals
- `CastVote`: Records votes on proposals
- `FinalizeProposal`: Updates proposal status after voting period
- `ExecuteProposal`: Executes approved proposals after timelock period
- `AddCouncilMember`: Adds new council members (governance-controlled)
- `RemoveCouncilMember`: Removes council members (governance-controlled)
- `CancelProposal`: Cancels active proposals

### 4. program/src/processor.rs

Added instruction handlers:

- `process_initialize_governance`: Creates the initial governance structure
- `process_create_proposal`: Creates new governance proposals
- `process_cast_vote`: Records votes on proposals
- `process_finalize_proposal`: Updates proposal status after voting
- `process_execute_proposal`: Executes approved proposals
- `process_add_council_member`: Adds new council members
- `process_remove_council_member`: Removes council members
- `process_cancel_proposal`: Cancels active proposals

Added helper functions:

- `execute_upgrade_program_proposal`: Handles program upgrade proposals
- `execute_change_transfer_fee_proposal`: Handles fee change proposals
- `execute_change_supply_parameters_proposal`: Handles supply parameter changes
- `execute_mint_tokens_proposal`: Handles token minting proposals
- `execute_burn_tokens_proposal`: Handles token burning proposals

## Security Considerations

1. **Input Validation**
   - String length validation in `add_proposal` prevents buffer overflow
   - Parameter bounds checking in all functions (e.g., max 100% for approval threshold)
   - Account ownership verification before any state modification

2. **Access Control**
   - All sensitive operations require council member authorization
   - Multi-signature requirement for proposal approval
   - Two-layer timelock (voting period + execution delay)

3. **Data Integrity**
   - Checked arithmetic operations prevent overflow
   - Conservative account sizing with 10% safety buffer
   - Proper serialization/deserialization with error handling

4. **User Protection**
   - No functionality for freezing user accounts
   - Transfer fees capped at 1% maximum (100 basis points)
   - Permanently disable upgrades function for protocol ossification

## Line Numbers for Key Changes

### state.rs
- Lines ~500-1050: All governance state structures and methods

### instruction.rs
- Lines ~470-570: Governance instruction definitions

### processor.rs
- Lines ~25-30: Import governance state types
- Lines ~490-550: Instruction handler dispatch in main process function
- Lines ~3000-3200: All governance instruction processing functions

