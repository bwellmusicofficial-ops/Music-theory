import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { listLessons, loadGlossary } from '@/content/load';
import { getMockConfig, listMockConfigs } from '@/mock/load';
import { MockRunnerPage } from './runner';

export const dynamicParams = false;

type Props = { params: Promise<{ id: string }> };

export function generateStaticParams() {
  return listMockConfigs().map((c) => ({ id: c.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const config = getMockConfig((await params).id);
  return { title: config ? config.title : 'Mock test not found' };
}

export default async function MockPage({ params }: Props) {
  const config = getMockConfig((await params).id);
  if (!config) notFound();
  const lessons = listLessons().map((l) => ({ id: l.id, title: l.title, skills: l.skills }));
  return <MockRunnerPage config={config} glossary={loadGlossary(config.grade)} lessons={lessons} />;
}
