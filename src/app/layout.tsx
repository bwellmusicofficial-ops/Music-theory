import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { SiteHeader } from '@/components/site/site-header';
import { NO_FLASH_SCRIPT, SettingsProvider } from '@/settings';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Music Theory Now', template: '%s | Music Theory Now' },
  description: 'Learn music theory by doing: short interactive lessons, from your first note to Grade 8.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a0a12',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The inline script sets data-theme and data-reduced-motion before first paint,
    // so the server markup and the DOM differ on <html> by design.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <SettingsProvider>
          <SiteHeader />
          <main className="flex flex-1 flex-col">{children}</main>
        </SettingsProvider>
      </body>
    </html>
  );
}
