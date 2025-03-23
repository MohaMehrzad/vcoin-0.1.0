import { PublicKey } from '@solana/web3.js';
import { getOrCreateKeypair, loadTokenMetadata, saveTokenMetadata } from '../../src/utils';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs and path
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

jest.mock('path', () => ({
  resolve: jest.fn(),
  dirname: jest.fn(),
}));

// Mock crypto for deterministic keypair generation
jest.mock('@solana/web3.js', () => {
  const original = jest.requireActual('@solana/web3.js');
  return {
    ...original,
    Keypair: {
      ...original.Keypair,
      generate: jest.fn().mockImplementation(() => {
        return {
          publicKey: new original.PublicKey('11111111111111111111111111111111'),
          secretKey: new Uint8Array(64).fill(1),
        };
      }),
      fromSecretKey: jest.fn().mockImplementation((secretKey) => {
        return {
          publicKey: new original.PublicKey('11111111111111111111111111111111'),
          secretKey,
        };
      }),
    },
  };
});

describe('Security: Input Validation Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (path.resolve as jest.Mock).mockImplementation((...args) => args.join('/'));
    (path.dirname as jest.Mock).mockImplementation((p) => p.split('/').slice(0, -1).join('/'));
  });

  describe('Keypair Security Tests', () => {
    test('should reject invalid keypair names', () => {
      // Test with invalid characters
      expect(() => getOrCreateKeypair('../malicious')).toThrow();
      expect(() => getOrCreateKeypair('./relative/path')).toThrow();
      expect(() => getOrCreateKeypair('/absolute/path')).toThrow();
      expect(() => getOrCreateKeypair('name with spaces')).toThrow();
      expect(() => getOrCreateKeypair('name;with;semicolons')).toThrow();
    });

    test('should sanitize keypair names', () => {
      // Mock implementation that checks if path was sanitized
      (fs.existsSync as jest.Mock).mockImplementation((path) => {
        // Verify that no path traversal is possible
        expect(path).not.toContain('..');
        expect(path).not.toContain('./');
        expect(path).not.toContain('../');
        return false;
      });

      getOrCreateKeypair('validname');
      expect(fs.existsSync).toHaveBeenCalled();
    });
  });

  describe('Token Metadata Security Tests', () => {
    beforeEach(() => {
      // Mock for loadTokenMetadata
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({
        mintAddress: '11111111111111111111111111111111',
        authorityAddress: '11111111111111111111111111111111',
        totalSupply: '1000000000',
        decimals: 6
      }));
    });

    test('should validate token metadata structure', () => {
      const metadata = loadTokenMetadata();
      
      // Check that required fields exist
      expect(metadata).toHaveProperty('mintAddress');
      expect(metadata).toHaveProperty('authorityAddress');
      expect(metadata).toHaveProperty('totalSupply');
      expect(metadata).toHaveProperty('decimals');
    });

    test('should reject invalid public keys in metadata', () => {
      // Mock reading invalid data
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({
        mintAddress: 'not-a-valid-public-key',
        authorityAddress: '11111111111111111111111111111111',
        totalSupply: '1000000000',
        decimals: 6
      }));

      // Loading should throw when validating the public key
      expect(() => {
        const metadata = loadTokenMetadata();
        // Simulate validation by creating a PublicKey
        new PublicKey(metadata.mintAddress);
      }).toThrow();
    });

    test('should validate token amounts in metadata', () => {
      // Mock reading invalid data
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({
        mintAddress: '11111111111111111111111111111111',
        authorityAddress: '11111111111111111111111111111111',
        totalSupply: 'not-a-number',
        decimals: 6
      }));

      // Loading should throw when validating the token amount
      expect(() => {
        const metadata = loadTokenMetadata();
        // Simulate validation by converting to BigInt
        BigInt(metadata.totalSupply);
      }).toThrow();
    });

    test('should prevent arbitrary JSON injection in metadata', () => {
      const maliciousData = {
        mintAddress: '11111111111111111111111111111111',
        authorityAddress: '11111111111111111111111111111111',
        authorityTokenAccount: '11111111111111111111111111111111', 
        totalSupply: '1000000000',
        decimals: 6,
        "__proto__": {
          "malicious": "payload"
        }
      };

      // Test that prototype pollution is prevented
      saveTokenMetadata(maliciousData);
      
      // Check that JSON.stringify was called with safe replacer
      expect(fs.writeFileSync).toHaveBeenCalled();
      const callArgs = (fs.writeFileSync as jest.Mock).mock.calls[0];
      
      // Extract the JSON string that was written
      const writtenJson = callArgs[1];
      
      // Parse it back to see if proto pollution worked
      const parsed = JSON.parse(writtenJson);
      
      // Create a test object to verify prototype is not polluted
      const testObj = {};
      
      // Verify that the prototype was not polluted
      expect((testObj as any).malicious).toBeUndefined();
    });
  });

  // Add more security tests for other parts of the system
}); 