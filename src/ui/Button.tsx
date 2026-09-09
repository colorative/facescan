import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  /* The `inverse*` set is for the solid-green success screen. The others all
     assume a dark ground: white-on-white/6 and red-on-red/15 both lose almost
     all their contrast against green. */
  | 'inverse'
  | 'inverseSecondary'
  | 'inverseGhost'

const VARIANTS: Record<Variant, string> = {
  /* The brand blue with white text. Near-black text on #105efb is only about
     3.5:1; white on it clears 4.5:1 at this weight. */
  primary:
    'bg-brand text-white font-semibold shadow-[0_0_44px_-10px_var(--color-brand)] hover:brightness-115',
  secondary:
    'bg-white/6 text-ink border border-hairline-strong backdrop-blur-md hover:bg-white/10',
  ghost: 'text-ink-2 hover:text-ink',
  danger: 'bg-red/15 text-red border border-red/40 hover:bg-red/25',
  inverse: 'bg-ground text-green font-semibold hover:brightness-125',
  inverseSecondary: 'border border-ground/25 bg-ground/10 text-ground hover:bg-ground/20',
  /* Same border as inverseSecondary so it is visibly a button and not stray
     text, but no fill — it stays a step below the action beside it. */
  inverseGhost:
    'border border-ground/25 text-ground/70 hover:bg-ground/10 hover:text-ground',
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  children: ReactNode
}

/**
 * Kiosk buttons are min 64px tall — a glove-and-hurry touch target, not a
 * mouse target. Transitions stay on transform/opacity to keep the compositor
 * on the fast path while the scan overlay is animating behind them.
 */
export function Button({ variant = 'secondary', className = '', children, ...rest }: Props) {
  return (
    <button
      {...rest}
      className={[
        'min-h-16 rounded-2xl px-8 text-lg tracking-tight',
        'transition-[transform,opacity,filter,background-color] duration-200',
        'ease-(--ease-enter) active:scale-[0.97]',
        'disabled:pointer-events-none disabled:opacity-40',
        VARIANTS[variant],
        className,
      ].join(' ')}
    >
      {children}
    </button>
  )
}
