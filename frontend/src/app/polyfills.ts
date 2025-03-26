/**
 * Polyfills for Solana wallet adapter compatibility
 */

if (typeof window !== 'undefined') {
  // TextEncoder/TextDecoder polyfill for older browsers
  if (typeof (window as any).TextEncoder === 'undefined') {
    console.log('Polyfilling TextEncoder/TextDecoder');
    require('fast-text-encoding');
  }

  // Buffer polyfill for browser
  if (typeof (window as any).Buffer === 'undefined') {
    console.log('Polyfilling Buffer');
    (window as any).Buffer = require('buffer/').Buffer;
  }

  // Process polyfill
  if (typeof (window as any).process === 'undefined') {
    console.log('Polyfilling process');
    (window as any).process = { env: { NODE_ENV: process.env.NODE_ENV } };
  }

  // Stream polyfills
  const stream = require('stream-browserify');
  if (typeof (window as any).Stream === 'undefined') {
    console.log('Polyfilling Stream');
    (window as any).Stream = stream.Stream;
  }
  if (typeof (window as any).Readable === 'undefined') {
    console.log('Polyfilling Readable');
    (window as any).Readable = stream.Readable;
  }
}

export {}; 