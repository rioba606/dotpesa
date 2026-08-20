import { useEffect, useRef } from "react";
import type { Phase } from "@/lib/mockApi";
import { cn } from "@/lib/utils";

interface Props {
  phase: Phase;
  multiplier: number;
  countdown: number;
  roundId: number;
}

/**
 * Responsive crash curve. Draws a rising line + particle trail (no aviation
 * iconography). The canvas is sized from its container via ResizeObserver so
 * it scales proportionally with zero layout shift and no scrollbars.
 */
export function CrashCanvas({ phase, multiplier, countdown, roundId }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ phase, multiplier });
  stateRef.current = { phase, multiplier };

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = wrap.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    const css = getComputedStyle(document.documentElement);
    const green = css.getPropertyValue("--primary").trim() || "oklch(0.82 0.26 143)";
    const red = css.getPropertyValue("--destructive").trim() || "oklch(0.62 0.23 26)";
    const grid = "oklch(0.32 0 0)";

    const draw = () => {
      const { phase: p, multiplier: m } = stateRef.current;
      ctx.clearRect(0, 0, w, h);

      // grid
      ctx.strokeStyle = grid;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1;
      for (let i = 1; i < 6; i++) {
        const y = (h / 6) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      for (let i = 1; i < 8; i++) {
        const x = (w / 8) * i;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      if (p === "waiting") {
        raf = requestAnimationFrame(draw);
        return;
      }

      const color = p === "crashed" ? red : green;
      const padX = 16;
      const padY = 18;
      const progress = Math.min(1, Math.log(Math.max(1, m)) / Math.log(12));
      const endX = padX + (w - padX * 2) * Math.min(0.94, 0.12 + progress * 0.85);
      const curveH = h - padY * 2;

      const pointAt = (t: number) => {
        const x = padX + (endX - padX) * t;
        const y = h - padY - curveH * Math.pow(t, 2.1) * Math.min(1, 0.15 + progress);
        return [x, y] as const;
      };

      // area fill
      ctx.beginPath();
      ctx.moveTo(padX, h - padY);
      for (let t = 0; t <= 1.0001; t += 0.02) {
        const [x, y] = pointAt(t);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(endX, h - padY);
      ctx.closePath();
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 1;

      // line
      ctx.beginPath();
      for (let t = 0; t <= 1.0001; t += 0.02) {
        const [x, y] = pointAt(t);
        if (t === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 3.5;
      ctx.lineCap = "round";
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // particle trail at head
      const [hx, hy] = pointAt(1);
      for (let i = 0; i < 8; i++) {
        const t = 1 - i * 0.035;
        if (t < 0) break;
        const [px, py] = pointAt(t);
        ctx.beginPath();
        ctx.globalAlpha = (1 - i / 8) * 0.5;
        ctx.fillStyle = color;
        ctx.arc(px + (Math.random() - 0.5) * 4, py + (Math.random() - 0.5) * 4, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 20;
      ctx.arc(hx, hy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className={cn(
        "relative aspect-[16/10] w-full overflow-hidden rounded-2xl border border-border bg-card sm:aspect-[16/8] lg:aspect-auto lg:h-[170px] xl:h-[190px]",
        phase === "crashed" && "animate-crash-flash",
      )}
    >
      <canvas ref={canvasRef} className="absolute inset-0 block" />

      <div className="pointer-events-none absolute inset-0 grid place-items-center px-4 text-center">
        {phase === "waiting" ? (
          <div className="animate-rise">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
              Next round in
            </p>
            <p className="font-display text-5xl font-extrabold tabular-nums sm:text-6xl lg:text-3xl xl:text-4xl">
              {countdown.toFixed(1)}s
            </p>
            <p className="mt-2 text-xs text-muted-foreground lg:mt-1">Round #{roundId}</p>
          </div>
        ) : (
          <div>
            <p
              className={cn(
                "font-display text-6xl font-extrabold tabular-nums sm:text-8xl lg:text-4xl xl:text-5xl",
                phase === "crashed" ? "text-destructive" : "text-primary text-glow",
              )}
            >
              {multiplier.toFixed(2)}x
            </p>
            {phase === "crashed" && (
              <p className="mt-1 font-display text-sm font-bold uppercase tracking-[0.3em] text-destructive">
                Crashed
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}