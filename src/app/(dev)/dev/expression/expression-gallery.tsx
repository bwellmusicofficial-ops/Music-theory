'use client';

import { Stave } from '@/components/stave';
import { useSettings } from '@/settings';
import { GALLERY } from './gallery';

export function ExpressionGallery() {
  const { settings, loaded } = useSettings();
  if (!loaded) return <p role="status">Loading</p>;
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-8 px-4 py-6" data-testid="expression-gallery">
      <h1 className="text-xl font-semibold">Expression markings</h1>
      {GALLERY.map((item) => (
        <section key={item.id} data-testid={`expr-${item.id}`} aria-labelledby={`expr-${item.id}-title`} className="flex flex-col gap-2">
          <h2 id={`expr-${item.id}-title`} className="text-base font-medium">
            {item.title}
          </h2>
          <div style={item.narrow ? { maxWidth: 330 } : undefined}>
            <Stave mode="read" passage={item.passage} terminology={settings.terminology} ariaLabel={item.title} />
          </div>
        </section>
      ))}
    </div>
  );
}
