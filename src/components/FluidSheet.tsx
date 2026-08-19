import { useEffect, useId, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { X } from "lucide-react";

type FluidSheetProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

type Point = { y: number; at: number };

export default function FluidSheet({ open, title, onClose, children }: FluidSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef(0);
  const valueRef = useRef(0);
  const pointsRef = useRef<Point[]>([]);
  const startRef = useRef({ pointerY: 0, sheetY: 0 });
  const titleId = useId();

  const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const renderAt = (value: number) => {
    valueRef.current = value;
    panelRef.current?.style.setProperty("transform", `translate3d(0, ${value}px, 0)`);
  };

  const springTo = (target: number, done?: () => void) => {
    cancelAnimationFrame(frameRef.current);
    if (reducedMotion()) {
      renderAt(target);
      done?.();
      return;
    }

    let last = performance.now();
    let velocity = 0;
    const stiffness = 420;
    const damping = 42;
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.032);
      last = now;
      const displacement = valueRef.current - target;
      velocity += (-stiffness * displacement - damping * velocity) * dt;
      const next = valueRef.current + velocity * dt;
      renderAt(next);
      if (Math.abs(velocity) < 3 && Math.abs(next - target) < 0.75) {
        renderAt(target);
        done?.();
        return;
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  };

  const closeSheet = () => {
    const height = panelRef.current?.getBoundingClientRect().height ?? 480;
    springTo(height + 32, () => dialogRef.current?.close());
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      renderAt(window.innerHeight);
      dialog.showModal();
      requestAnimationFrame(() => springTo(0));
      requestAnimationFrame(() => {
        panelRef.current?.querySelector<HTMLElement>("a, button, input, select, textarea")?.focus({ preventScroll: true });
      });
    } else if (!open && dialog.open) {
      closeSheet();
    }
    // Animation functions intentionally read the live refs on every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    cancelAnimationFrame(frameRef.current);
    event.currentTarget.setPointerCapture(event.pointerId);
    startRef.current = { pointerY: event.clientY, sheetY: valueRef.current };
    pointsRef.current = [{ y: event.clientY, at: performance.now() }];
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const raw = startRef.current.sheetY + event.clientY - startRef.current.pointerY;
    const next = raw < 0 ? raw * 0.08 : raw;
    renderAt(next);
    const now = performance.now();
    pointsRef.current.push({ y: event.clientY, at: now });
    pointsRef.current = pointsRef.current.filter((point) => now - point.at <= 100);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const points = pointsRef.current;
    const first = points[0];
    const last = points[points.length - 1];
    const velocity = first && last && last.at > first.at ? (last.y - first.y) / (last.at - first.at) : 0;
    const height = panelRef.current?.getBoundingClientRect().height ?? 480;
    const projected = valueRef.current + velocity * 180;
    if (projected > height * 0.34 || velocity > 0.62) closeSheet();
    else springTo(0);
  };

  return (
    <dialog
      ref={dialogRef}
      className="m-fluid-sheet"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        closeSheet();
      }}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) closeSheet();
      }}
    >
      <div ref={panelRef} className="m-fluid-sheet__panel">
        <div
          className="m-fluid-sheet__grabber"
          aria-label="اسحب لإغلاق القائمة"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <span aria-hidden="true" />
        </div>
        <header className="m-fluid-sheet__header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" onClick={closeSheet} aria-label="إغلاق القائمة">
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="m-fluid-sheet__body">{children}</div>
      </div>
    </dialog>
  );
}
