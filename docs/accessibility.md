# Accessibility

Target: WCAG 2.2 level AA. This page records what is tested and how, what was fixed, what is still wrong, and how to test by hand with a screen reader. The public, plain-English version is the `/accessibility` page (`src/app/(site)/accessibility/page.tsx`); keep the two in step.

## What is tested automatically

All of it runs in the Playwright `phone` project (390x844, touch, dark) with `npm run e2e`. The specs are `e2e/a11y-*.phone.spec.ts`, helpers in `e2e/helpers/{axe,a11y,dom-checks,keyboard}.ts`.

| Check | Spec | What it does |
| --- | --- | --- |
| axe-core, WCAG 2.0/2.1/2.2 A and AA plus best-practice rules | `a11y-axe` | Every static route, the lesson page at each of its six steps plus a challenge question, one question of each of the nine types (via the dev harness), the mock test (start, question, question list, finish dialog, results), each game at start, during play and at results. Dark and light. Serious and critical findings fail the run, and so do moderate ones unless they are listed in `ACCEPTED` in `helpers/axe.ts` (the list is empty). |
| Keyboard only | `a11y-keyboard` | Nothing uses the mouse. Controls are reached with Tab (an unreachable control or a focus trap fails the test) and used with Enter, Space and arrow keys. Every Tab stop must show a focus indicator (outline of 2px or more, or a ring). Covers: exemplar lesson hook, explore (rhythm pad) and name, with focus landing on the new step heading; every control of each of the nine question types is reachable; multiple choice and ordering are answered; the Grade 1 mock test (answer, next, question list, flag, finish dialog keeps focus and closes on Escape, results); Note Rush (letter keys), Key Hunt and Term Blitz (number keys) rounds; library tabs (arrow keys, Home, End) and search; every setting. |
| Touch targets | `a11y-structure` | Every button, link and form control on every route, lesson step, question type, the mock test and the game play screens is at least 24x24 CSS px (SC 2.5.8). Primary actions (action bar buttons, answer options, tap pad, tab bar, game answers, note-name keys) must be at least 44x44. Links and term buttons inside a sentence are exempt. |
| Reduced motion | `a11y-structure` | With the app setting and with the device setting, no element or pseudo-element on the dashboard, a lesson or a game has an animation or transition longer than 0.01 ms. |
| 200% zoom and 200% text size | `a11y-structure` | A 195px wide viewport (200% of 390) and `html { font-size: 200% }` on home, a lesson step with notation, a multiple-choice question and the mock question screen: the page does not scroll sideways, no text is clipped by an `overflow: hidden` box or runs out of its button, and targets stay at 24px. Screenshots go to `/tmp/p1-a11y-shots/` and were looked at. |
| Names and structure | `a11y-structure` | Exactly one `h1` and no skipped heading levels on every route and lesson step; one banner and one main landmark (and a navigation landmark outside full-screen games and the mock paper); `lang="en"` on `html`; a title on every page and no two routes sharing one; "Skip to content" is the first focusable element on every layout and moves focus to `main`; every control has a name; live regions are polite and not duplicated; `lang="it"` on Italian glossary headings and on Italian terms in Term Blitz. |
| Unit tests | `src/lesson/player/rich-text-view.test.tsx` | Italian terms in lesson text links and in the glossary popover carry `lang="it"`. |

## What was found and fixed

axe, before and after (counted as findings over all pages, both themes):

- Before: 54 findings. 10 serious `label-content-name-mismatch` (lesson links on the course map, the mock results review list, Key Hunt answers), 2 serious `scrollable-region-focusable` (the stave scroll box in an ordering question), 36 moderate `page-has-heading-one` (game screens, mock screens), 2 moderate `heading-order` (glossary), and the `/accessibility` route did not exist (404 with no landmarks).
- After: 0 findings of any impact.

Fixes, with the cause:

- Course map and lesson list links: the `aria-label` did not start with the text the link shows (WCAG 2.5.3). The name is now the visible text in the visible order ("3, Quavers, complete, 6 min, Grade 1 rhythm"). Parts of the visible text have real spaces between them so assistive technology reads words.
- Mock results review buttons: the label is now built from the visible content, with a screen-reader-only "Question" before the number.
- Key Hunt answers: the shortcut digit is drawn by CSS, so it is not part of the visible text.
- One `h1` per screen: game start and results titles are `h1` (results sub-heading is `h2`); each game play screen and the mock question and review screens have an `h1` (visually hidden in the games).
- Glossary: terms are `h2` under the page `h1`; the decorative letter heading stays hidden from assistive technology.
- Skip link: first element in the body of every page, target `#main-content` on the site and lesson layouts.
- Language: `lang="it"` (and fr, de) on foreign glossary headings, glossary links in lesson text, the glossary popover title, and Term Blitz terms and options.
- Stave: a read-only stave that is wider than its box now takes a Tab stop so the arrow keys scroll it (SC 2.1.1).
- Ordering rows: notation was squeezed to 68px and hid every note (a real defect the sweep did not catch because it only checked that the SVG existed). The row now wraps its buttons under notation. The sweep now also asserts the first note is inside the visible box.
- Complete-bar palette: glyph overflow in the first row of palette buttons swallowed taps meant for the row below, so some symbols could not be chosen by touch or mouse. The tool buttons now clip their overflow.
- 200% zoom: home cards, the mock header buttons and the mock Previous/Flag/Next row wrap instead of overflowing; the bottom tab bar pills shrink to fit five tabs.
- Recap card "Open lesson" link is a 44px target.
- Missing favicon (a 404 on every page) added.
- New `/accessibility` statement, linked from Settings and from the site footer.

## Remaining issues

None of these fails an automated check. Success criteria are WCAG 2.2.

- Bottom tab bar labels are shortened with an ellipsis at 200% zoom on a 195px viewport ("Libr...", "Ga..."). The full names are still in the accessible name. SC 1.4.4, 1.4.10 (minor).
- Questions that depend on hearing (by-ear questions, tap-the-rhythm "listen first", the audio exhibits) have no text equivalent of the sound. The point of the question is to hear it. SC 1.1.1, 1.2.1. Needs a decision about what a deaf or hard-of-hearing learner should be offered instead.
- Tapping a rhythm in time is a timing task even by keyboard (Space on the pad). SC 2.2.1 allows it as essential, but it is a barrier. Tap It has no untimed scored mode; the other games and the challenge clock have the untimed setting.
- Keyboard only: reachability and focus indicators are tested for every question type, but only multiple choice and ordering are answered by keyboard in a script. Match-up, spot-the-mistake, complete-the-bar, note-on-stave placement and the piano keyboard are operable by keyboard by design (arrow keys, Enter) and have unit tests, but have no scripted end-to-end keyboard answer. SC 2.1.1.
- Screen reader experience of the stave editors (`role="application"`) and the piano keyboard (roving focus) has not been tested with a real screen reader. SC 4.1.2.
- Piano keys are narrower than the 44px target size used for buttons: white keys fill the width of the keyboard and are at least 21px wide (15 keys fit a 360px phone), black keys 60% of that. They follow the instrument's proportions, are 176px or more tall, and can be played by sliding a finger or from the computer keyboard; the scroll buttons that appear when a range is too long are 44px. axe's target-size check passes on them, and the touch-target spec checks keys against their own floor (white 20px, black 12px wide, 24px tall) instead of 24x24. SC 2.5.8 (minor, essential presentation).
- Colour contrast is checked by axe in the states the specs reach (both themes). Hover, pressed and some feedback states are not covered. SC 1.4.3, 1.4.11.
- No outside audit and no testing with disabled users has happened.

## Manual test script (VoiceOver on iPhone and macOS, or NVDA on Windows)

Do this before launch and after any large UI change. Note anything that is announced wrongly, announced twice, or not announced.

1. Home (not signed in, no progress): swipe or Tab through the page. Expect: "Skip to content" first; one level 1 heading "Music theory that clicks."; links named by what they do.
2. Press "Skip to content". Focus should land at the start of the main content, and the next item read should be the heading.
3. Open the rotor (VoiceOver: two-finger twist; NVDA: Insert+F7) and list headings, landmarks and links. Expect one h1, a banner, navigation, main and a footer, and no unnamed links.
4. Course map (Learn): each lesson link should read as "<number>, <title>, <state>, <minutes>, <grade and strand>". The current lesson says "You are here".
5. Open the first lesson. After Continue, the focus moves to the new step heading and it is read ("Explore", "Name it 1 of ..."). Check each step reads its text, not "image" for notation: a stave should read as a description ("Treble clef, 4 4 time, bar 1: ...").
6. Explore with the rhythm pad: find the pad, activate Start, tap with Space. Listen for the live announcements; they should be polite and not repeat.
7. Practice, multiple choice: options read as buttons with their text; pick one; the result ("Correct", or the reason) is announced once.
8. Practice, ordering: use the "Move ... up/down" buttons and the arrow keys; the new position is announced.
9. Note-on-stave and complete-the-bar: arrow keys move the caret, Enter places, the live region announces what changed. Note anything confusing.
10. Italian words (Glossary, a lesson with "adagio" or similar): the screen reader should switch to an Italian voice for the term, and back.
11. Mock test: start, answer, open the question list, flag, Finish. The finish dialog must trap focus and Escape must close it. Results: heading "Question ..." review buttons read the question number and the outcome.
12. Games: start Note Rush, answer with letter keys; each note is announced once ("Note 3 of 20, on the second line."). Check the pause control and the results.
13. Settings: every toggle reads its name and on/off state. Switch on reduced motion, untimed and US terms and confirm they apply.
14. Zoom the browser to 200% and 400%; check nothing is cut off and nothing needs sideways scrolling except notation.
15. Repeat steps 1 to 3 in dark and light theme and in the device's high-contrast mode.
