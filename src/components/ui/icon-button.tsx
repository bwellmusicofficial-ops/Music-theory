import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { BUTTON_BASE, BUTTON_VARIANTS, ICON_BUTTON_SIZES, type ButtonSize, type ButtonVariant } from './button-styles';
import { cn } from './cn';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'> {
  /** Required accessible name: an icon alone says nothing to a screen reader. */
  'aria-label': string;
  /** The icon, usually an inline svg. It is hidden from assistive tech. */
  icon: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function IconButton({
  icon,
  variant = 'ghost',
  size = 'md',
  type = 'button',
  className,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      data-variant={variant}
      data-size={size}
      className={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], ICON_BUTTON_SIZES[size], className)}
      {...rest}
    >
      <span aria-hidden="true" className="inline-flex items-center justify-center">
        {icon}
      </span>
    </button>
  );
}
