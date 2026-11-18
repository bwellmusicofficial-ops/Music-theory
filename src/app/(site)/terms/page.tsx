import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { PageContainer, PageTitle } from '@/components/site/page-container';

export const metadata: Metadata = { title: 'Terms of use' };

const link = 'font-semibold text-accent underline underline-offset-2';

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2 id={id} className="text-xl font-bold">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Terms of use. DRAFT for legal review (backlog 24). Plain English, readable by an 11-year-old. */
export default function TermsPage() {
  return (
    <PageContainer width="md">
      <p role="note" className="rounded-lg border border-warning px-4 py-3 text-sm font-semibold">
        Draft: these terms are waiting for a legal check.
      </p>
      <PageTitle title="Terms of use">The rules for using Music Theory Now.</PageTitle>

      <Section id="t-use" title="Using the site">
        <p>
          You can use the lessons, games and mock tests for your own learning, and teachers can use them with their
          classes. The site is still being built, so things may change, move or stop working for a while.
        </p>
      </Section>

      <Section id="t-exams" title="Exams">
        <p>
          The lessons follow the topics of the graded music theory exams used in the UK. Music Theory Now is not part
          of, or approved by, any exam board. We work hard to make every answer correct, but using the site does not
          guarantee an exam result.
        </p>
      </Section>

      <Section id="t-content" title="Our content">
        <p>
          The lessons, questions, games, pictures and sounds on this site belong to us or are used with permission.
          Please don&rsquo;t copy them to another website or sell them. Music examples are written for this site or are
          old enough to be free for everyone to use.
        </p>
      </Section>

      <Section id="t-mistakes" title="If something is wrong">
        <p>
          If you find a mistake in a lesson or something that does not work, please tell us. Contact details will be
          added here before launch.
        </p>
      </Section>

      <Section id="t-privacy" title="Your privacy">
        <p>
          How we handle information is explained on the{' '}
          <Link href="/privacy" className={link}>
            privacy page
          </Link>
          .
        </p>
      </Section>

      <Section id="t-law" title="The law">
        <p>These terms are governed by the law of England and Wales.</p>
      </Section>

      <p className="text-sm text-fg-secondary">Last updated: 18 November 2026 (draft).</p>
    </PageContainer>
  );
}
