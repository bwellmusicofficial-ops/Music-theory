import type { Metadata } from 'next';
import { SignInForm } from '@/accounts/ui/sign-in-form';

export const metadata: Metadata = { title: 'Sign in' };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6">
      <SignInForm />
    </div>
  );
}
