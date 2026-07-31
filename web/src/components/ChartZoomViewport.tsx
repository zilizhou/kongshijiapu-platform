"use client";

import { ReactNode, useCallback, useEffect, useRef, useState } from "react";

const MIN = 0.4;
const MAX = 2.5;
const STEP = 0.1;

function clamp(n: number) {
  return Math.min(MAX, Math.max(MIN, Math.round(n * 100) / 100));
}

export function ChartZoomViewport({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const [scale, setScale] = useState(1);
  const scaleRef = useRef(1);
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const measure = () => {
      setNatural({ w: el.offsetWidth, h: el.offsetHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const applyZoom = useCallback((next: number, origin?: { x: number; y: number }) => {
    const prev = scaleRef.current;
    const clamped = clamp(next);
    if (clamped === prev) return;
    const vp = viewportRef.current;
    if (vp && origin) {
      const ratio = clamped / prev;
      const left = vp.scrollLeft;
      const top = vp.scrollTop;
      requestAnimationFrame(() => {
        vp.scrollLeft = (left + origin.x) * ratio - origin.x;
        vp.scrollTop = (top + origin.y) * ratio - origin.y;
      });
    }
    scaleRef.current = clamped;
    setScale(clamped);
  }, []);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const handler = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const rect = vp.getBoundingClientRect();
      applyZoom(scaleRef.current + (e.deltaY > 0 ? -STEP : STEP), {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    };
    vp.addEventListener("wheel", handler, { passive: false });
    return () => vp.removeEventListener("wheel", handler);
  }, [applyZoom]);

  const pct = Math.round(scale * 100);

  return (
    <div className="relative">
      <div className="absolute right-3 top-3 z-10 flex items-center gap-0.5 rounded-lg border border-line bg-white/95 p-1 shadow-card backdrop-blur">
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-sm text-ink hover:bg-soft disabled:opacity-40"
          disabled={scale <= MIN}
          title="缩小"
          onClick={() => applyZoom(scale - STEP)}
        >
          −
        </button>
        <button
          type="button"
          className="min-w-[3.25rem] rounded-md px-1 py-1 text-center text-xs tabular-nums text-muted hover:bg-soft"
          title="重置为 100%"
          onClick={() => applyZoom(1)}
        >
          {pct}%
        </button>
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-sm text-ink hover:bg-soft disabled:opacity-40"
          disabled={scale >= MAX}
          title="放大"
          onClick={() => applyZoom(scale + STEP)}
        >
          +
        </button>
        <span className="mx-1 hidden text-[10px] text-muted sm:inline">
          Ctrl/⌘+滚轮
        </span>
      </div>

      <div
        ref={viewportRef}
        className={`max-h-[min(72vh,calc(100vh-200px))] overflow-auto overscroll-contain ${className}`}
      >
        <div
          style={{
            width: natural.w ? Math.ceil(natural.w * scale) : undefined,
            height: natural.h ? Math.ceil(natural.h * scale) : undefined,
          }}
        >
          <div
            ref={contentRef}
            className="inline-block origin-top-left will-change-transform"
            style={{ transform: `scale(${scale})` }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
