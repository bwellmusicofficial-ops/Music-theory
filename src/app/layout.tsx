import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
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
        {/* First focusable element on every page: lets keyboard and screen-reader users jump past the header and tab bar. */}
        <a
          href="#main-content"
          className="fixed left-3 top-3 z-50 -translate-y-24 rounded-md bg-accent px-4 py-3 font-bold text-on-accent shadow-lg focus:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg"
        >
          Skip to content
        </a>
        <SettingsProvider>
          {children}
        </SettingsProvider>
      </body>
    </html>
  );
}
