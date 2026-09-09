/**
 * Idle atmosphere for the Attract screen: slow-drifting aurora blooms in the
 * brand blue over a receding grid. Deliberately cheap — transform and opacity only, no blur
 * animation, no canvas — because it runs indefinitely while the kiosk is idle
 * and must not budget against the scan overlay.
 */
export function AmbientField() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* The receding grid.

          The flicker in the far field is aliasing: past a certain depth the
          64px lattice projects to under a pixel of spacing, so every frame
          resamples it slightly differently and the horizon crawls.

          Moving the plane by a composited transform instead of animating
          background-position was measurably worse (mean inter-frame delta 1.0
          -> 2.3, directional reversals 8k -> 18k per megapixel), because the
          compositor minifies a once-rasterized layer with no mipmaps. The
          reliable fix is not to draw that region at all: the mask now fades
          the grid out while its line spacing is still several pixels, and the
          shallower tilt keeps compression gentler across what remains.

          The lines are also 2px on a wider 72px lattice with a sub-pixel blur.
          A hard 1px hairline is the thing that cannot survive minification —
          there is no mipmapping here, so it either lands on a pixel or does
          not. Giving it a soft profile lets minification average it instead of
          snapping it on and off. */}
      <div className="absolute inset-0 opacity-[0.34] [mask-image:linear-gradient(to_top,black_0%,black_14%,transparent_44%)]">
        <div className="animate-grid-drift absolute inset-x-[-50%] bottom-[-10%] h-[70%] [background-image:linear-gradient(to_right,var(--color-brand)_0,var(--color-brand)_2px,transparent_2px),linear-gradient(to_bottom,var(--color-brand)_0,var(--color-brand)_2px,transparent_2px)] [background-size:72px_72px] [filter:blur(0.7px)] [transform:perspective(560px)_rotateX(66deg)]" />
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
