import type { Metadata } from 'next';
import { TapItRunner } from './runner';

export const metadata: Metadata = { title: 'Tap It' };

export default function TapItPage() {
  return <TapItRunner />;
}
