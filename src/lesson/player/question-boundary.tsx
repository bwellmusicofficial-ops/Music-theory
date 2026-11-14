'use client';

import { Component, type ReactNode } from 'react';
import { DevErrorCard } from './dev-error-card';

interface Props {
  children: ReactNode;
  questionId: string;
  onSkip: () => void;
}

/** Catches a question component that throws while rendering, so the lesson survives it. */
export class QuestionBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <DevErrorCard
          title={`Question "${this.props.questionId}" crashed while rendering`}
          detail={this.state.error.message}
          onSkip={this.props.onSkip}
        />
      );
    }
    return this.props.children;
  }
}
