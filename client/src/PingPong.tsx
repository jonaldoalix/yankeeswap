import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

export function PingPong({
  children,
  measureKey,
}: {
  children: ReactNode;
  measureKey: string;
}) {
  const viewRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [travel, setTravel] = useState(0);

  useLayoutEffect(() => {
    const view = viewRef.current;
    const inner = innerRef.current;
    if (!view || !inner) return;

    const measure = () => {
      const next = Math.max(0, inner.scrollHeight - view.clientHeight);
      setTravel((prev) => (Math.abs(prev - next) < 1 ? prev : next));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(view);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [measureKey]);

  const bouncing = travel > 4;
  const seconds = bouncing ? Math.max(14, 10 + travel / 7) : 0;

  return (
    <div className="pingpong-view" ref={viewRef}>
      <div
        ref={innerRef}
        className={bouncing ? "pingpong-inner is-bouncing" : "pingpong-inner"}
        style={
          {
            "--pingpong-travel": `${travel}px`,
            "--pingpong-duration": `${seconds}s`,
          } as CSSProperties
        }
      >
        {children}
      </div>
    </div>
  );
}
