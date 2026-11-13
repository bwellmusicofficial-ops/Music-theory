export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 font-semibold select-none cursor-pointer ' +
  'transition-[background-color,color,transform,box-shadow] duration-(--motion-duration-fast) ease-standard ' +
  'active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100';

export const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover hover:shadow-glow',
  secondary: 'bg-surface-raised text-fg border border-border hover:bg-surface',
  ghost: 'bg-transparent text-fg hover:bg-surface-raised',
  danger: 'bg-danger text-on-danger hover:brightness-110',
};

export const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 text-sm rounded-md',
  md: 'min-h-11 px-5 text-base rounded-md',
  lg: 'min-h-14 px-7 text-lg rounded-lg',
};

export const ICON_BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'size-9 rounded-md',
  md: 'size-11 rounded-md',
  lg: 'size-14 rounded-lg',
};
