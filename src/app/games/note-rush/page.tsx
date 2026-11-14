import type { Metadata } from 'next';
import { NoteRushRunner } from './runner';

export const metadata: Metadata = { title: 'Note Rush' };

export default function NoteRushPage() {
  return <NoteRushRunner />;
}
