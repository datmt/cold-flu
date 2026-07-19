'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import Sidebar from '@/components/Sidebar';

const DEFAULT_WIDTH = 340;
const MIN_WIDTH = 260;
const STORAGE_KEY = 'coldflu:sidebarWidth';

function clamp(value: number) {
  const max = window.innerWidth * 0.5;
  return Math.min(Math.max(value, MIN_WIDTH), max);
}

export default function ChainsLayout({ children }: { children: React.ReactNode }) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const draggingRef = useRef(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from localStorage once on mount
    if (stored) setWidth(clamp(Number(stored)));
  }, []);

  const startResize = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      draggingRef.current = true;

      const onMouseMove = (moveEvent: MouseEvent) => {
        if (!draggingRef.current) return;
        setWidth(clamp(moveEvent.clientX));
      };

      const onMouseUp = () => {
        draggingRef.current = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        setWidth((current) => {
          window.localStorage.setItem(STORAGE_KEY, String(current));
          return current;
        });
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [],
  );

  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100vh-3rem)] lg:flex-row lg:gap-0 lg:overflow-hidden">
      <div
        style={{ '--sidebar-w': `${width}px` } as React.CSSProperties}
        className="h-64 shrink-0 overflow-hidden rounded-2xl border border-gray-800 lg:h-full lg:w-[var(--sidebar-w)]"
      >
        <Sidebar />
      </div>
      <div
        onMouseDown={startResize}
        className="hidden w-1.5 shrink-0 cursor-col-resize items-stretch justify-center px-0.5 lg:flex"
      >
        <div className="w-px rounded-full bg-gray-800 transition hover:bg-indigo-500" />
      </div>
      <div className="min-w-0 flex-1 lg:overflow-y-auto">{children}</div>
    </div>
  );
}
