declare module 'bs58' {
  /**
   * Encodes a buffer as a base58 string
   */
  export function encode(source: Uint8Array | Buffer): string;
  
  /**
   * Decodes a base58 string into a buffer
   */
  export function decode(string: string): Buffer;
} 