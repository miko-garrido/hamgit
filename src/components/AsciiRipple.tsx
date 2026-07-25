import { useEffect, useRef } from "react";

/** Soft glyphs for a light background — denser = brighter wave crest. */
const CHARS = " .·:oO*";

type Props = {
  /** When true, ripples expand from the origin. */
  active: boolean;
  /** Ripple center in container-local CSS pixels. */
  origin: { x: number; y: number } | null;
};

/**
 * Full-bleed ASCII wave field. Invisible until `active`; then concentric
 * ripples emanate from `origin` into the background. Purely decorative —
 * pointer-events none, honors prefers-reduced-motion.
 */
export function AsciiRipple({ active, origin }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);
  const originRef = useRef(origin);
  const fadeRef = useRef(0);
  const startRef = useRef(0);
  const rafRef = useRef(0);
  const reducedRef = useRef(false);

  activeRef.current = active;
  originRef.current = origin;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedRef.current = media.matches;
    const onMotion = () => {
      reducedRef.current = media.matches;
    };
    media.addEventListener("change", onMotion);

    const cellW = 11;
    const cellH = 16;
    let cssW = 0;
    let cssH = 0;
    let dpr = 1;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cssW = parent!.clientWidth;
      cssH = parent!.clientHeight;
      canvas!.width = Math.max(1, Math.floor(cssW * dpr));
      canvas!.height = Math.max(1, Math.floor(cssH * dpr));
      canvas!.style.width = `${cssW}px`;
      canvas!.style.height = `${cssH}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const ro = new ResizeObserver(resize);
    ro.observe(parent);
    resize();

    function draw(now: number) {
      if (!startRef.current) startRef.current = now;
      const target = activeRef.current ? 1 : 0;
      // Ease opacity toward target so leave fades out instead of cutting.
      const fadeSpeed = target > fadeRef.current ? 0.08 : 0.045;
      fadeRef.current += (target - fadeRef.current) * fadeSpeed;
      if (fadeRef.current < 0.01 && !activeRef.current) {
        fadeRef.current = 0;
        ctx!.clearRect(0, 0, cssW, cssH);
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const originPt = originRef.current;
      ctx!.clearRect(0, 0, cssW, cssH);
      if (!originPt || fadeRef.current < 0.01) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const t = (now - startRef.current) / 1000;
      const cols = Math.ceil(cssW / cellW) + 1;
      const rows = Math.ceil(cssH / cellH) + 1;
      const maxDist = Math.hypot(cssW, cssH);

      ctx!.font = `12px SFMono-Regular, ui-monospace, Menlo, monospace`;
      ctx!.textAlign = "center";
      ctx!.textBaseline = "middle";

      // Reduced motion: soft static halo of dots, no traveling wave.
      if (reducedRef.current) {
        for (let row = 0; row < rows; row += 1) {
          for (let col = 0; col < cols; col += 1) {
            const x = col * cellW + cellW / 2;
            const y = row * cellH + cellH / 2;
            const dist = Math.hypot(x - originPt.x, y - originPt.y);
            if (dist < 28 || dist > 120) continue;
            const a = fadeRef.current * 0.22 * (1 - (dist - 28) / 92);
            if (a < 0.02) continue;
            ctx!.fillStyle = `rgba(148, 163, 184, ${a})`;
            ctx!.fillText("·", x, y);
          }
        }
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      // Expanding front so the first hover feels like a welcome splash.
      const front = Math.min(maxDist, 40 + t * 280);

      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const x = col * cellW + cellW / 2;
          const y = row * cellH + cellH / 2;
          const dist = Math.hypot(x - originPt.x, y - originPt.y);
          if (dist < 22 || dist > front) continue;

          // Two overlapping rings keep the field lively while hovered.
          const wave =
            Math.sin(dist * 0.055 - t * 3.2) * 0.55 +
            Math.sin(dist * 0.028 - t * 1.6) * 0.45;
          const envelope = Math.exp(-dist / 340) * (1 - dist / front);
          const intensity = Math.max(0, wave) * envelope * fadeRef.current;
          if (intensity < 0.04) continue;

          const idx = Math.min(
            CHARS.length - 1,
            Math.floor(intensity * (CHARS.length - 1) * 1.35),
          );
          const ch = CHARS[idx];
          if (ch === " ") continue;

          const alpha = Math.min(0.45, 0.08 + intensity * 0.55);
          ctx!.fillStyle = `rgba(100, 116, 139, ${alpha})`;
          ctx!.fillText(ch, x, y);
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      media.removeEventListener("change", onMotion);
    };
  }, []);

  // Reset the expand clock each time hover begins so rings restart from the button.
  useEffect(() => {
    if (active) startRef.current = 0;
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0"
    />
  );
}
