import type { Metadata } from 'next';
import { SignUpFlow } from '@/accounts/ui/sign-up-flow';

export const metadata: Metadata = { title: 'Make an account' };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6">
      <SignUpFlow />
    </div>
  );
}
