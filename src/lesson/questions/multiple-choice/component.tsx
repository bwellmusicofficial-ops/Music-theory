"use client";

import { useState } from "react";
import { cn } from "@/components/ui/cn";
import type { QuestionProps } from "@/lesson/contracts";
import { ExhibitView } from "@/lesson/player/exhibit-view";
import {
  FaceView,
  ResultMark,
  SelectedMark,
} from "@/lesson/questions/face-view";
import { passageExhibitRenderer } from "@/lesson/questions/notation";
import { useAnswerReporting } from "@/lesson/questions/use-answer-reporting";
import type { MultipleChoiceAnswer, MultipleChoicePayload } from "./types";

const LETTERS = ["A", "B", "C", "D"] as const;

/** What the question is about (a key signature, a note, a bar) is drawn above the options. */
const EXHIBIT_RENDERERS = { passage: passageExhibitRenderer };

/** Large option buttons. Choosing one commits the answer at once. Options keep their array order. */
export function MultipleChoice({
  payload,
  locked,
  result,
  onAnswer,
  initialAnswer,
  onAnswerChange,
}: QuestionProps<MultipleChoicePayload, MultipleChoiceAnswer>) {
  const [chosen, setChosen] = useState<string | null>(() =>
    payload.options.some((o) => o.id === initialAnswer?.optionId)
      ? (initialAnswer?.optionId ?? null)
      : null,
  );
  useAnswerReporting<MultipleChoiceAnswer>(
    chosen === null ? null : { optionId: chosen },
    onAnswerChange,
  );

  function choose(optionId: string) {
    if (locked) return;
    setChosen(optionId);
    onAnswer({ optionId });
  }

  return (
    <div className="flex flex-col gap-4">
      {payload.exhibit ? (
        <div
          data-question-exhibit
          className="rounded-lg border border-border-subtle bg-surface p-3"
        >
          <ExhibitView
            exhibit={payload.exhibit}
            renderers={EXHIBIT_RENDERERS}
            label="The music this question is about"
            playable={false}
          />
        </div>
      ) : null}
      <ul className="flex flex-col gap-3" aria-label="Answer options">
        {payload.options.map((option, index) => {
          const isCorrect = option.id === payload.correct;
          const isChosen = chosen === option.id;
          const state =
            result === null
              ? isChosen
                ? "selected"
                : "idle"
              : isCorrect
                ? "right"
                : isChosen
                  ? "wrong"
                  : "other";
          const markLabel = state === "selected" || state === "right" || state === "wrong";
          return (
            <li key={option.id}>
              <button
                type="button"
                disabled={locked}
                aria-pressed={result === null ? isChosen : undefined}
                data-state={state}
                onClick={() => choose(option.id)}
                className={cn(
                  "flex min-h-14 w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border-2 bg-surface px-4 py-3 text-left text-fg",
                  "transition-[border-color,opacity] duration-(--motion-duration-fast) ease-standard",
                  "enabled:cursor-pointer enabled:hover:border-accent",
                  "disabled:cursor-default",
                  state === "idle" && "border-border",
                  state === "selected" && "border-accent",
                  state === "right" && "border-success",
                  state === "wrong" && "border-danger",
                  state === "other" && "border-border-subtle opacity-60",
                )}
              >
                <span
                  aria-hidden="true"
                  className="flex size-9 shrink-0 items-center justify-center rounded-md border-2 border-border text-sm font-bold text-fg-secondary"
                >
                  {LETTERS[index]}
                </span>
                <span className="flex min-w-0 flex-1 items-center text-lg font-semibold">
                  <FaceView face={option.face} />
                </span>
                {/*
                  A passage is wide, so the label goes on its own line under the stave, never over it. Short faces
                  keep it on the right. The text label carries the meaning; colour and icon only support it.
                */}
                {markLabel ? (
                  <span
                    data-option-mark
                    className={cn(
                      option.face.kind === "passage" &&
                        "basis-full ps-[calc(2.25rem+1rem)]",
                    )}
                  >
                    {state === "selected" ? <SelectedMark /> : null}
                    {state === "right" ? (
                      <ResultMark tone="right">Correct answer</ResultMark>
                    ) : null}
                    {state === "wrong" ? (
                      <ResultMark tone="wrong">Your answer</ResultMark>
                    ) : null}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
