// Global type declarations for the project

// For process.env variables
declare namespace NodeJS {
  interface ProcessEnv {
    SOL_BALANCE_THRESHOLD_LEVEL1?: string;
    SOL_BALANCE_THRESHOLD_LEVEL2?: string;
    SOL_BALANCE_THRESHOLD_LEVEL3?: string;
    PRIVATE_KEY?: string;
    ADMIN_WALLET_ADDRESS?: string;
    // Add other environment variables as needed
  }
}

// Declaration for BN.js if needed
declare module 'bn.js' {
  class BN {
    constructor(number: number | string | BN, base?: number | 'hex', endian?: string);
    toString(base?: number | 'hex', length?: number): string;
    toNumber(): number;
    toArray(endian?: string, length?: number): number[];
    toBuffer(endian?: string, length?: number): Buffer;
    bitLength(): number;
    zeroBits(): number;
    byteLength(): number;
    isNeg(): boolean;
    isEven(): boolean;
    isOdd(): boolean;
    isZero(): boolean;
    cmp(b: BN): number;
    lt(b: BN): boolean;
    lte(b: BN): boolean;
    gt(b: BN): boolean;
    gte(b: BN): boolean;
    eq(b: BN): boolean;
    isBN(b: any): b is BN;
    
    // Math operations
    neg(): BN;
    abs(): BN;
    add(b: BN): BN;
    sub(b: BN): BN;
    mul(b: BN): BN;
    sqr(): BN;
    pow(b: BN): BN;
    div(b: BN): BN;
    mod(b: BN): BN;
    // Add other methods as needed
  }
  export = BN;
}

// Add custom type declarations for your project here
interface PresaleData {
  presaleId: string;
  startTime: number;
  endTime: number;
  isActive: boolean;
  // Add other properties used in the presale
}

interface VestingSchedule {
  id: string;
  recipientAddress: string;
  tokenAmount: number | string;
  releaseTimestamps: number[];
  // Add other properties used in the vesting schedule
}

// Add other interfaces and types as needed

// Price cache for the price oracle
declare global {
  var priceCache: Map<string, {
    price: number;
    timestamp: number;
  }>;
} 