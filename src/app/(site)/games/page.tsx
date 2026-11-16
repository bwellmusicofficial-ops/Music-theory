import type { Metadata } from 'next';
import { GameList } from '@/components/site/game-list';

export const metadata: Metadata = { title: 'Games' };

export default function GamesPage() {
  return <GameList />;
}
