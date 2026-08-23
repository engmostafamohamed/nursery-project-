import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';

const STORAGE_PREFIX = 'xo-ai-assistant-panel-position';
const VIEWPORT_MARGIN = 8;
const MD_MIN_WIDTH = 768;

export type AiPanelPoint = { x: number; y: number };

function storageKeyForUser(userId: string): string {
  const id = userId.trim() || 'anonymous';
  return `${STORAGE_PREFIX}:${id}`;
}

function defaultCenteredPosition(): AiPanelPoint {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const estW = Math.min(512, vw * 0.95);
  const estH = Math.min(vh * 0.85, 640);
  return {
    x: Math.max(VIEWPORT_MARGIN, (vw - estW) / 2),
    y: Math.max(VIEWPORT_MARGIN, (vh - estH) / 2),
  };
}

function loadSavedPosition(key: string): AiPanelPoint {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultCenteredPosition();
    const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown };
    if (typeof parsed.x === 'number' && typeof parsed.y === 'number' && Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
      return { x: parsed.x, y: parsed.y };
    }
  } catch {
    /* ignore */
  }
  return defaultCenteredPosition();
}

function clampToViewport(
  x: number,
  y: number,
  panelWidth: number,
  panelHeight: number,
  vw: number,
  vh: number,
): AiPanelPoint {
  const maxX = Math.max(VIEWPORT_MARGIN, vw - panelWidth - VIEWPORT_MARGIN);
  const maxY = Math.max(VIEWPORT_MARGIN, vh - panelHeight - VIEWPORT_MARGIN);
  return {
    x: Math.min(Math.max(VIEWPORT_MARGIN, x), maxX),
    y: Math.min(Math.max(VIEWPORT_MARGIN, y), maxY),
  };
}

type DragOrigin = { startClientX: number; startClientY: number; startX: number; startY: number };

export function useAiAssistantPanelPosition(userId: string, aiOpen: boolean) {
  const [position, setPosition] = useState<AiPanelPoint>(() =>
    typeof window === 'undefined' ? { x: 0, y: 0 } : loadSavedPosition(storageKeyForUser(userId)),
  );
  const prevUserIdRef = useRef(userId);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (prevUserIdRef.current === userId) return;
    prevUserIdRef.current = userId;
    setPosition(loadSavedPosition(storageKeyForUser(userId)));
  }, [userId]);
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(`(min-width: ${MD_MIN_WIDTH}px)`).matches,
  );
  const panelRef = useRef<HTMLDivElement | null>(null);
  const positionRef = useRef(position);
  const dragOriginRef = useRef<DragOrigin | null>(null);

  useEffect(() => {
    positionRef.current = position;
  });
  const draggingRef = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${MD_MIN_WIDTH}px)`);
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const clampWithEl = useCallback(() => {
    const el = panelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setPosition((p) => clampToViewport(p.x, p.y, rect.width, rect.height, vw, vh));
  }, []);

  useLayoutEffect(() => {
    if (!aiOpen || !isDesktop) return;
    clampWithEl();
  }, [aiOpen, isDesktop, clampWithEl]);

  useEffect(() => {
    if (!aiOpen || !isDesktop) return;
    const onResize = () => clampWithEl();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [aiOpen, isDesktop, clampWithEl]);

  const onHeaderPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!isDesktop) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest('button, a, input, textarea, select, [role="button"]')) return;
      e.preventDefault();
      draggingRef.current = true;
      dragOriginRef.current = {
        startClientX: e.clientX,
        startClientY: e.clientY,
        startX: positionRef.current.x,
        startY: positionRef.current.y,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [isDesktop],
  );

  const onHeaderPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current || !dragOriginRef.current) return;
      const origin = dragOriginRef.current;
      const el = panelRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const dx = e.clientX - origin.startClientX;
      const dy = e.clientY - origin.startClientY;
      const next = clampToViewport(
        origin.startX + dx,
        origin.startY + dy,
        rect.width,
        rect.height,
        window.innerWidth,
        window.innerHeight,
      );
      positionRef.current = next;
      setPosition(next);
    },
    [],
  );

  const endHeaderDrag = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (draggingRef.current) {
        draggingRef.current = false;
        dragOriginRef.current = null;
        try {
          localStorage.setItem(storageKeyForUser(userId), JSON.stringify(positionRef.current));
        } catch {
          /* ignore */
        }
      }
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        /* ignore */
      }
    },
    [userId],
  );

  const contentStyle: CSSProperties | undefined = isDesktop
    ? {
        left: position.x,
        top: position.y,
        transform: 'none',
      }
    : undefined;

  const headerClassName = isDesktop ? 'cursor-grab active:cursor-grabbing touch-none select-none' : '';

  return {
    panelRef,
    contentStyle,
    headerPointerHandlers: {
      onPointerDown: onHeaderPointerDown,
      onPointerMove: onHeaderPointerMove,
      onPointerUp: endHeaderDrag,
      onPointerCancel: endHeaderDrag,
    },
    headerClassName,
    isDesktop,
  };
}
