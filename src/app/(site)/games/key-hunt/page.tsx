import type { Metadata } from 'next';
import { KeyHuntRunner } from './runner';

export const metadata: Metadata = { title: 'Key Hunt' };

export default function KeyHuntPage() {
  return <KeyHuntRunner />;
}
