import type { Metadata } from 'next';
import { RecoverForm } from '@/accounts/ui/recover-form';

export const metadata: Metadata = { title: 'Get back in' };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6">
      <RecoverForm />
    </div>
  );
}
