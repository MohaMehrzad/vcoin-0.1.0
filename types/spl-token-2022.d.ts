declare module '@solana/spl-token-2022' {
  import {
    Connection,
    PublicKey,
    Signer,
    Transaction,
    TransactionSignature,
    SendOptions
  } from '@solana/web3.js';

  export type ExtensionType = {
    transferFee: { discriminator: number };
    interestBearingConfig: { discriminator: number };
    nonTransferable: { discriminator: number };
    permanentDelegate: { discriminator: number };
    confidentialTransfer: { discriminator: number };
  };

  export const ExtensionType: ExtensionType;

  export const TOKEN_2022_PROGRAM_ID: PublicKey;

  export type Account = {
    address: PublicKey;
    mint: PublicKey;
    owner: PublicKey;
    amount: bigint;
    delegate: PublicKey | null;
    delegatedAmount: bigint;
    isInitialized: boolean;
    isFrozen: boolean;
    isNative: boolean;
    rentExemptReserve: bigint | null;
    closeAuthority: PublicKey | null;
  };

  export type Mint = {
    address: PublicKey;
    mintAuthority: PublicKey | null;
    supply: bigint;
    decimals: number;
    isInitialized: boolean;
    freezeAuthority: PublicKey | null;
  };

  export type TransferFee = {
    epoch: bigint;
    maximumFee: bigint;
    transferFeeBasisPoints: number;
  };

  export type TransferFeeConfig = {
    transferFeeConfigAuthority: PublicKey | null;
    withdrawWithheldAuthority: PublicKey | null;
    withheldAmount: bigint;
    olderTransferFee: TransferFee;
    newerTransferFee: TransferFee;
  };

  export type InterestBearingConfig = {
    rateAuthority: PublicKey | null;
    rate: number;
  };

  export type ConfidentialTransferConfig = {
    authority: PublicKey | null;
    autoApproveNewAccounts: boolean;
    auditorElGamalPubkey: Uint8Array | null;
  };

  export function getAccount(
    connection: Connection,
    address: PublicKey,
    commitment?: string,
    programId?: PublicKey
  ): Promise<Account>;

  export function getMint(
    connection: Connection,
    address: PublicKey,
    commitment?: string,
    programId?: PublicKey
  ): Promise<Mint>;

  export function getTransferFeeConfig(
    mint: Mint
  ): TransferFeeConfig | null;

  export function getTransferFeeConfig(
    connection: Connection,
    address: PublicKey,
    commitment?: string,
    programId?: PublicKey
  ): Promise<TransferFeeConfig>;

  export function getTransferFeeAmount(
    transferFeeConfig: TransferFeeConfig,
    amount: bigint
  ): bigint;

  export function getInterestBearingConfig(
    connection: Connection,
    address: PublicKey,
    commitment?: string,
    programId?: PublicKey
  ): Promise<InterestBearingConfig>;

  export function getConfidentialTransferConfig(
    connection: Connection,
    address: PublicKey,
    commitment?: string,
    programId?: PublicKey
  ): Promise<ConfidentialTransferConfig>;

  export function createInitializeMintInstruction(
    mint: PublicKey,
    decimals: number,
    mintAuthority: PublicKey,
    freezeAuthority: PublicKey | null,
    programId?: PublicKey
  ): import('@solana/web3.js').TransactionInstruction;

  export function createMint(
    connection: Connection,
    payer: Signer,
    mintAuthority: PublicKey,
    freezeAuthority: PublicKey | null,
    decimals: number,
    mint?: Signer,
    mintLen?: number | null,
    programId?: PublicKey,
    confirmOptions?: SendOptions,
    extensions?: ExtensionType[]
  ): Promise<PublicKey>;

  export function createAccount(
    connection: Connection,
    payer: Signer,
    mint: PublicKey,
    owner: PublicKey,
    keypair?: Signer,
    confirmOptions?: SendOptions,
    programId?: PublicKey
  ): Promise<PublicKey>;

  export function createInitializeTransferFeeConfigInstruction(
    mint: PublicKey,
    transferFeeConfigAuthority: PublicKey | null,
    withdrawWithheldAuthority: PublicKey | null,
    transferFeeBasisPoints: number,
    maximumFee: bigint,
    programId?: PublicKey
  ): import('@solana/web3.js').TransactionInstruction;

  export function createInitializeInterestBearingConfigInstruction(
    mint: PublicKey,
    rateAuthority: PublicKey,
    rate: number,
    programId?: PublicKey
  ): import('@solana/web3.js').TransactionInstruction;

  export function createInitializeNonTransferableMintInstruction(
    mint: PublicKey,
    programId?: PublicKey
  ): import('@solana/web3.js').TransactionInstruction;

  export function createInitializePermanentDelegateInstruction(
    mint: PublicKey,
    permanentDelegate: PublicKey,
    programId?: PublicKey
  ): import('@solana/web3.js').TransactionInstruction;

  export function createInitializeConfidentialTransferMintInstruction(
    mint: PublicKey,
    authority: PublicKey,
    autoApproveNewAccounts: boolean,
    auditorPubkey: Uint8Array | null,
    programId?: PublicKey
  ): import('@solana/web3.js').TransactionInstruction;

  export function mintTo(
    connection: Connection,
    payer: Signer,
    mint: PublicKey,
    destination: PublicKey,
    authority: Signer | PublicKey,
    amount: number | bigint,
    multiSigners?: Signer[],
    confirmOptions?: SendOptions,
    programId?: PublicKey
  ): Promise<TransactionSignature>;

  export function transfer(
    connection: Connection,
    payer: Signer,
    source: PublicKey,
    destination: PublicKey,
    owner: Signer | PublicKey,
    amount: number | bigint,
    multiSigners?: Signer[],
    confirmOptions?: SendOptions,
    programId?: PublicKey
  ): Promise<TransactionSignature>;

  export function createAssociatedTokenAccountInstruction(
    payer: PublicKey,
    associatedToken: PublicKey,
    owner: PublicKey,
    mint: PublicKey,
    programId?: PublicKey,
    associatedTokenProgramId?: PublicKey
  ): import('@solana/web3.js').TransactionInstruction;

  export function getAssociatedTokenAddress(
    mint: PublicKey,
    owner: PublicKey,
    allowOwnerOffCurve?: boolean,
    programId?: PublicKey,
    associatedTokenProgramId?: PublicKey
  ): Promise<PublicKey>;

  export function getOrCreateAssociatedTokenAccount(
    connection: Connection,
    payer: Signer,
    mint: PublicKey,
    owner: PublicKey,
    allowOwnerOffCurve?: boolean,
    confirmOptions?: SendOptions,
    programId?: PublicKey,
    associatedTokenProgramId?: PublicKey
  ): Promise<Account>;

  export function getMintLen(
    extensions: ExtensionType[]
  ): number;

  export function createTransferCheckedInstruction(
    source: PublicKey,
    mint: PublicKey,
    destination: PublicKey,
    owner: PublicKey,
    amount: number | bigint,
    decimals: number,
    multiSigners?: Signer[],
    programId?: PublicKey
  ): import('@solana/web3.js').TransactionInstruction;

  export function createMintToInstruction(
    mint: PublicKey,
    destination: PublicKey,
    authority: PublicKey,
    amount: number | bigint,
    multiSigners?: Signer[],
    programId?: PublicKey
  ): import('@solana/web3.js').TransactionInstruction;
} 