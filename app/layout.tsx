// app/layout.tsx
import type { Metadata } from 'next';
import '@vepando/liquid-glass-react/style.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Greenville DIY Archive & Barter Market',
  description:
    'Upstate South Carolina and Carolinas DIY skate, underground music, 24-bit FLAC archive, and zero-fee artist barter market.',
  openGraph: {
    title: 'Greenville DIY Archive & Barter Market',
    description:
      'Upstate South Carolina and Carolinas DIY skate, underground music, 24-bit FLAC archive, and zero-fee artist barter market.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Greenville DIY Archive & Barter Market',
    description:
      'Upstate South Carolina and Carolinas DIY skate, underground music, 24-bit FLAC archive, and zero-fee artist barter market.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-season="fall" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
