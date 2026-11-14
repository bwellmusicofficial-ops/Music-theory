import { Button } from '@/components/ui';

export interface PlayButtonProps {
  /** What is played, e.g. "the example". The button reads "Play the example" / "Stop the example". */
  label: string;
  playing: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

/** A play and stop toggle with an icon and a text label. */
export function PlayButton({ label, playing, onToggle, disabled }: PlayButtonProps) {
  return (
    <Button variant="secondary" disabled={disabled} aria-pressed={playing} onClick={onToggle}>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="currentColor">
        {playing ? <rect x="6" y="6" width="12" height="12" rx="2" /> : <path d="M8 5v14l11-7z" />}
      </svg>
      {playing ? 'Stop' : 'Play'} {label}
    </Button>
  );
}
