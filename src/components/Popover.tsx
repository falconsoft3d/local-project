"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export default function Popover({
  trigger,
  children,
}: {
  trigger: (toggle: () => void, open: boolean) => ReactNode;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function update() {
      const r = anchorRef.current?.getBoundingClientRect();
      if (!r) return;
      setPos({ top: r.bottom + 4, left: r.left });
    }
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  return (
    <div ref={anchorRef} className="inline-block">
      {trigger(() => setOpen((o) => !o), open)}
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              zIndex: 1000,
            }}
            className="max-h-72 min-w-[220px] overflow-auto rounded-md border border-neutral-200 bg-white p-2 shadow-lg"
          >
            {children(() => setOpen(false))}
          </div>,
          document.body,
        )}
    </div>
  );
}
