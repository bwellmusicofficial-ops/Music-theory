import type { Metadata } from 'next';
import Link from 'next/link';
import { SettingsForm } from './settings-form';

export const metadata: Metadata = { title: 'Settings' };

export default function SettingsPage() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Settings</h1>
      <SettingsForm />
      <p className="text-fg-secondary">
        <Link href="/accessibility" className="inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-2">
          Accessibility statement
        </Link>
      </p>
    </div>
  );
}
