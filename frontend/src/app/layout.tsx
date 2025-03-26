import './globals.css';
import { Providers } from './providers';
import type { Metadata } from 'next';
import { Suspense } from 'react';

export const metadata: Metadata = {
  title: 'VCoin - Secure Token-2022 Solana Cryptocurrency',
  description: 'VCoin is a secure cryptocurrency built on Solana\'s Token-2022 protocol, designed for the next generation of financial technology.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Suspense fallback={<div>Loading wallet providers...</div>}>
          <Providers>{children}</Providers>
        </Suspense>
      </body>
    </html>
  );
}
