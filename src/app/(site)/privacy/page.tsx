import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { PageContainer, PageTitle } from '@/components/site/page-container';

export const metadata: Metadata = { title: 'Privacy' };

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

/**
 * Privacy notice. DRAFT for legal review (docs/accounts-and-data.md, backlog 24).
 * It describes the site as it is today (no accounts, browser storage only) and
 * what will change when accounts open. Keep it true: update it in the same
 * change as anything that alters what is collected.
 */
export default function PrivacyPage() {
  return (
    <PageContainer width="md">
      <p role="note" className="rounded-lg border border-warning px-4 py-3 text-sm font-semibold">
        Draft: this page is waiting for a legal check and will be finished before accounts open.
      </p>
      <PageTitle title="Privacy">What we keep about you, and what we don&rsquo;t.</PageTitle>

      <Section id="p-short" title="The short version">
        <ul className="list-disc space-y-1 pl-6">
          <li>You don&rsquo;t need an account. We don&rsquo;t ask for your name, email or age.</li>
          <li>Your progress is saved only on your own device, in your browser. We never receive it.</li>
          <li>There are no adverts, no trackers and no chat.</li>
          <li>
            You can clear everything at any time in{' '}
            <Link href="/settings#clear-data" className={link}>
              Settings
            </Link>
            .
          </li>
        </ul>
      </Section>

      <Section id="p-device" title="What is saved on your device">
        <p>To remember where you are, this site saves these in your browser&rsquo;s storage on your device:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>your settings, such as theme, sound and UK or US terms;</li>
          <li>which lessons you have started or finished, and your answers to questions;</li>
          <li>your best scores in games and your mock test results.</li>
        </ul>
        <p>
          This stays on your device. It is not sent to us or to anyone else. Someone else using the same browser could
          see it. We do not use cookies.
        </p>
      </Section>

      <Section id="p-host" title="What our web host sees">
        <p>
          The site is hosted by Vercel. Like every website, their servers receive your device&rsquo;s internet (IP)
          address and basic details of each request, such as which page was asked for and the type of browser, so they
          can send you the page and protect the site from attacks. We do not use this to identify you and we add no
          analytics or advertising tools.
        </p>
      </Section>

      <Section id="p-accounts" title="When accounts arrive">
        <p>We plan to add optional accounts so you can keep your progress across devices. The plan is:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Under 18: you choose a code name and a password. We will not ask for your real name or email.</li>
          <li>18 or over: the same, or you can give your name and email if you want to. We would only send you news if you tick a separate box.</li>
          <li>No one else will be able to see your account. There will be no public profiles.</li>
          <li>You will be able to download or delete everything we hold about you from Settings.</li>
        </ul>
        <p>This page will be updated before accounts open, and will say exactly what is kept, why and for how long.</p>
      </Section>

      <Section id="p-rights" title="Your rights">
        <p>
          UK data protection law gives you the right to ask what we hold about you, to have it corrected or deleted, and
          to complain. Today we hold nothing about you, because everything stays on your device. If you are worried
          about how your information is used, you can contact the Information Commissioner&rsquo;s Office at{' '}
          <a href="https://ico.org.uk" className={link}>
            ico.org.uk
          </a>
          .
        </p>
      </Section>

      <Section id="p-contact" title="Who we are">
        <p>The name of the organisation responsible for this site, and how to contact it, will be added here before launch.</p>
      </Section>

      <p className="text-sm text-fg-secondary">Last updated: 18 November 2026 (draft).</p>
    </PageContainer>
  );
}
