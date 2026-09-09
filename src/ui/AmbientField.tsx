/**
 * Idle atmosphere for the Attract screen: slow-drifting aurora blooms in the
 * brand blue over a receding grid. Deliberately cheap — transform and opacity only, no blur
 * animation, no canvas — because it runs indefinitely while the kiosk is idle
 * and must not budget against the scan overlay.
 */
export function AmbientField() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 opacity-[0.34] [mask-image:linear-gradient(to_top,black,transparent_75%)]">
        <div className="absolute inset-x-[-50%] bottom-[-10%] h-[70%] animate-grid-drift [background-image:linear-gradient(to_right,var(--color-brand)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-brand)_1px,transparent_1px)] [background-size:64px_64px] [transform:perspective(520px)_rotateX(72deg)]" />
      </div>

      <div className="absolute top-[-18%] left-[-10%] h-[80vmin] w-[80vmin] animate-bloom-a rounded-full bg-brand/40 blur-[90px]" />
      <div className="absolute top-[4%] right-[-20%] h-[58vmin] w-[58vmin] animate-bloom-b rounded-full bg-violet/28 blur-[90px]" />
      <div className="absolute bottom-[-14%] left-[18%] h-[52vmin] w-[52vmin] animate-bloom-a rounded-full bg-brand/24 blur-[110px]" />

      {/* Vignette keeps the eye centred and hides the grid's hard edges. It is
          eased out further than the blooms are bright, so the atmosphere reads
          without the headline losing contrast against it. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_42%,var(--color-ground)_100%)]" />
    </div>
  )
}
