import type { Metadata } from 'next';
import Link from 'next/link';
import { PageContainer, PageTitle } from '@/components/site/page-container';

export const metadata: Metadata = { title: 'Accessibility' };

/** A plain-English accessibility statement. Keep it honest: say what is tested, and what is not. */
export default function AccessibilityPage() {
  return (
    <PageContainer width="md">
      <PageTitle title="Accessibility">We want everyone to be able to learn music theory here. This page says what we have done and where we fall short.</PageTitle>

      <section aria-labelledby="a11y-aim" className="flex flex-col gap-2">
        <h2 id="a11y-aim" className="text-xl font-bold">
          What we aim for
        </h2>
        <p>We are working to meet the Web Content Accessibility Guidelines (WCAG) 2.2, level AA. We have not had the site audited by an outside specialist, so we cannot claim full conformance.</p>
      </section>

      <section aria-labelledby="a11y-done" className="flex flex-col gap-2">
        <h2 id="a11y-done" className="text-xl font-bold">
          What works today
        </h2>
        <ul className="list-disc space-y-1 pl-6">
          <li>You can use every page with a keyboard alone. A &ldquo;Skip to content&rdquo; link is the first thing you reach.</li>
          <li>Buttons and links are large enough to tap on a phone.</li>
          <li>Music notation has a text description for screen readers, for example the names and lengths of the notes.</li>
          <li>Light and dark themes, and text that still works when you zoom to 200%.</li>
          <li>
            In <Link href="/settings" className="font-semibold text-accent underline underline-offset-2">Settings</Link> you can turn on reduced motion, turn off sound, and switch off the clock in timed challenges.
          </li>
          <li>Italian, French and German terms are marked up so a screen reader can pronounce them properly.</li>
        </ul>
      </section>

      <section aria-labelledby="a11y-limits" className="flex flex-col gap-2">
        <h2 id="a11y-limits" className="text-xl font-bold">
          What does not work well yet
        </h2>
        <ul className="list-disc space-y-1 pl-6">
          <li>Some questions depend on hearing: the &ldquo;listen and choose&rdquo; questions and the rhythm clicks. There is no text version of the sound yet.</li>
          <li>Tapping a rhythm needs good timing. You can tap with the keyboard, but it is still a timing task, and some games are fast.</li>
          <li>Placing notes on a stave by touch is fiddly with a screen reader. The keyboard route works better.</li>
          <li>We have tested with automated tools and by hand with a keyboard. We have not yet tested with real screen readers and switch devices; that is planned.</li>
        </ul>
      </section>

      <section aria-labelledby="a11y-contact" className="flex flex-col gap-2">
        <h2 id="a11y-contact" className="text-xl font-bold">
          Tell us about a problem
        </h2>
        <p>Contact details will be added before launch.</p>
      </section>
    </PageContainer>
  );
}
