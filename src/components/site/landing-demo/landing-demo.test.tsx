import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listLessons, loadGlossary } from '@/content/load';
import type { QuestionProps, QuestionTypeRegistry } from '@/lesson/contracts';
import { questionTypes } from '@/lesson/questions';
import { SettingsProvider } from '@/settings';
import { resetBrowserState } from '../test-utils';
import { buildLandingDemoContent } from './content';
import { LandingDemo } from './landing-demo';

const content = buildLandingDemoContent(listLessons(), loadGlossary('start'));
const START = '/lessons/first';

/** The pad needs real audio and real time; this stand-in answers when tapped, as the real one answers when finished. */
function PadStandIn({ onAnswer }: QuestionProps<unknown, unknown>) {
  return (
    <button type="button" onClick={() => onAnswer({ errorsMs: [0, 0, 0, 0], extraTaps: 0, accuracy: 1 })}>
      Stand-in pad
    </button>
  );
}
/** The by-ear component opens its options only after real playback; this stand-in lists them open and keeps the real marking. */
function ByEarStandIn({ payload, onAnswer, locked }: QuestionProps<{ options: { id: string }[] }, unknown>) {
  return (
    <ul aria-label="Answer options">
      {payload.options.map((o) => (
        <li key={o.id}>
          <button type="button" disabled={locked} aria-pressed={false} onClick={() => onAnswer({ optionId: o.id })}>
            {`Clip ${o.id.toUpperCase()}`}
          </button>
        </li>
      ))}
    </ul>
  );
}
const stubbed: QuestionTypeRegistry = {
  ...questionTypes,
  'by-ear': { ...questionTypes['by-ear']!, Component: ByEarStandIn as never },
  'tap-rhythm': { ...questionTypes['tap-rhythm']!, Component: PadStandIn as never, mark: () => ({ correct: true, score: 1 }) },
};

function setup(props: { defaultOpen?: boolean; registry?: QuestionTypeRegistry } = {}) {
  return render(
    <SettingsProvider>
      <LandingDemo content={content} startHref={START} defaultOpen={props.defaultOpen ?? true} questionTypes={props.registry ?? stubbed} />
    </SettingsProvider>,
  );
}

const options = () => within(screen.getByRole('list', { name: 'Answer options' })).getAllByRole('button');
const correctIndex = () => {
  const payload = content.steps[0].payload as { options: { id: string }[]; correct: string };
  return payload.options.findIndex((o) => o.id === payload.correct);
};

beforeEach(() => resetBrowserState());
afterEach(cleanup);

describe('LandingDemo', () => {
  it('opens on step 1 with the progress text, the question and both options', () => {
    setup();
    expect(screen.getByRole('heading', { level: 2, name: /30-second demo/ })).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Which clip sounds higher?' })).toBeInTheDocument();
    expect(options()).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Skip demo' })).toBeInTheDocument();
  });

  it('says why a wrong answer is wrong, at once, and moves focus to Next', () => {
    setup();
    fireEvent.click(options()[1 - correctIndex()]!);
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('Not quite');
    expect(banner).toHaveTextContent(/Listen for the clip that sounds higher/);
    expect(screen.getByRole('button', { name: 'Next' })).toHaveFocus();
    // Locked: a second tap changes nothing.
    fireEvent.click(options()[correctIndex()]!);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Not quite');
  });

  it('confirms a right answer, then goes through the rhythm step to the finish card', () => {
    setup();
    fireEvent.click(options()[correctIndex()]!);
    expect(screen.getByRole('status')).toHaveTextContent('Yes, that one is higher.');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3 })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Stand-in pad' }));
    expect(screen.getByRole('status')).toHaveTextContent('Correct');
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));

    expect(screen.getByText('Step 3 of 3')).toBeInTheDocument();
    const heading = screen.getByRole('heading', { level: 3, name: /That.s how every lesson works/ });
    expect(heading).toHaveFocus();
    expect(screen.getByRole('link', { name: /Start the first lesson/ })).toHaveAttribute('href', START);
    expect(screen.getByRole('link', { name: 'Browse lessons' })).toHaveAttribute('href', '/learn');
    expect(screen.queryByRole('button', { name: 'Skip demo' })).toBeNull();
  });

  it('can be restarted from the finish card', () => {
    setup();
    fireEvent.click(options()[correctIndex()]!);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stand-in pad' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Try the demo again' }));
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
    expect(options()).toHaveLength(2);
    // Fresh: nothing is chosen and no feedback shows.
    expect(screen.queryByRole('status')).toBeNull();
    for (const option of options()) expect(option).toHaveAttribute('aria-pressed', 'false');
  });

  it('can be skipped to a compact card and reopened', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Skip demo' }));
    const compact = screen.getByRole('heading', { level: 2, name: 'Try a 30-second demo' });
    expect(compact).toHaveFocus();
    expect(screen.queryByRole('list', { name: 'Answer options' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try it' }));
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
  });

  it('starts as the compact card when asked, and does not take focus on load', () => {
    setup({ defaultOpen: false });
    expect(screen.getByRole('heading', { level: 2, name: 'Try a 30-second demo' })).not.toHaveFocus();
    expect(screen.queryByRole('list', { name: 'Answer options' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try it' }));
    expect(screen.getByRole('heading', { level: 3, name: 'Which clip sounds higher?' })).toBeInTheDocument();
  });

  it('does not take focus when it opens first', () => {
    setup();
    expect(document.body).toHaveFocus();
  });

  it('uses no wording that differs between UK and US (so the US switch has nothing to swap)', () => {
    const text = JSON.stringify(content.steps.map((st) => [st.prompt, st.rightReason, st.payload])).replace(/"(kind|letter|value|type|clef|mode)":"[^"]*"/g, '');
    expect(text).not.toMatch(/\b(stave|bar|tone|semitone|crotchet|minim|quaver|pause)\b/i);
  });

  it('does not use the lesson hint, which only makes sense inside the lesson', () => {
    expect(JSON.stringify(content)).not.toMatch(/mouse|lion/i);
  });

  it('hides the page buttons only while the finish card shows', () => {
    const seen: boolean[] = [];
    render(
      <SettingsProvider>
        <LandingDemo content={content} startHref={START} defaultOpen questionTypes={stubbed} onFinishChange={(f) => seen.push(f)} />
      </SettingsProvider>,
    );
    fireEvent.click(options()[correctIndex()]!);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stand-in pad' }));
    expect(seen.at(-1)).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    expect(seen.at(-1)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Try the demo again' }));
    expect(seen.at(-1)).toBe(false);
  });

  it('keeps "I already know some theory" on the finish card as a quiet link', () => {
    setup();
    fireEvent.click(options()[correctIndex()]!);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stand-in pad' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    expect(screen.getByRole('link', { name: 'I already know some theory' })).toHaveAttribute('href', '/learn#grade-1');
  });

  it('draws the real by-ear question for step 1: play buttons, options closed until both clips are heard', () => {
    setup({ registry: questionTypes });
    expect(screen.getByRole('button', { name: /Play clip A/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Play clip B/ })).toBeInTheDocument();
    for (const option of options()) expect(option).toBeDisabled();
  });

  it('has its own two question types by default, enough for both of its steps', () => {
    render(
      <SettingsProvider>
        <LandingDemo content={content} startHref={START} defaultOpen />
      </SettingsProvider>,
    );
    // Step 1 is the real by-ear question, drawn without any registry being passed in.
    expect(screen.getByRole('button', { name: /Play clip A/ })).toBeInTheDocument();
    for (const step of content.steps) expect(['by-ear', 'tap-rhythm']).toContain(step.type);
  });

  it('writes nothing to storage and makes no network request while it runs', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    setup();
    fireEvent.click(options()[correctIndex()]!);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stand-in pad' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Try the demo again' }));
    expect(writes).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    writes.mockRestore();
    vi.unstubAllGlobals();
  });

  it('never strands a visitor when a question cannot be drawn', () => {
    const broken = { ...content, steps: [{ ...content.steps[0], payload: { nonsense: true } }, content.steps[1]] } as typeof content;
    render(
      <SettingsProvider>
        <LandingDemo content={broken} startHref={START} defaultOpen questionTypes={stubbed} />
      </SettingsProvider>,
    );
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(/could not be shown/);
    act(() => screen.getByRole('button', { name: 'Carry on' }).click());
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();
  });

  it('draws the real rhythm pad for step 2, with its Start button, notation and no listen-first', () => {
    setup({ registry: { ...questionTypes, 'by-ear': stubbed['by-ear']! } });
    fireEvent.click(options()[correctIndex()]!);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('region', { name: 'Rhythm pad' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Listen' })).toBeNull();
    expect(screen.getByTestId('notation')).toBeInTheDocument();
  });
});
