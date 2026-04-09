import { useState, useRef, useCallback } from 'react';

interface Props {
  type: 'vanilla' | 'react';
  name: string;
  height?: number;
}

const buttonStyle: React.CSSProperties = {
  padding: '5px 6px',
  background: 'rgba(0, 0, 0, 0.6)',
  color: '#f0edd8',
  border: 'none',
  fontFamily: 'monospace',
  fontSize: 11,
  cursor: 'pointer',
  transition: 'color 0.15s',
  lineHeight: 1,
};

function ExamplePreview({ type, name, height = 600 }: Props) {
  const isDev = import.meta.env.DEV;
  const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');

  const src = isDev
    ? `/${type}/${name}/`
    : `${base}examples/${type}/${name}/`;

  return (
    <iframe
      src={src}
      style={{
        width: '100%',
        height,
        border: 'none',
        borderRadius: '8px',
        background: '#1a1a2e',
      }}
      title={`${type}/${name} preview`}
      allow="cross-origin-isolated"
    />
  );
}

const STORAGE_KEY = 'flatland-example-type';

function getStoredType(): 'vanilla' | 'react' | null {
  try { return localStorage.getItem(STORAGE_KEY) as 'vanilla' | 'react' | null; } catch { return null; }
}

function DevExamplePreview(props: Props) {
  const [activeType, setActiveType] = useState<'vanilla' | 'react'>(
    () => getStoredType() ?? props.type,
  );
  const containerRef = useRef<HTMLDivElement>(null);

  const toggle = () =>
    setActiveType((t) => {
      const next = t === 'vanilla' ? 'react' : 'vanilla';
      try { localStorage.setItem(STORAGE_KEY, next); } catch {}
      return next;
    });

  const goFullscreen = useCallback(() => {
    const iframe = containerRef.current?.querySelector('iframe');
    if (iframe) {
      iframe.requestFullscreen?.() ??
        (iframe as any).webkitRequestFullscreen?.();
    }
  }, []);

  const hover = (e: React.MouseEvent) => {
    e.currentTarget.style.color = 'rgba(240, 237, 216, 0.9)';
  };
  const unhover = (e: React.MouseEvent) => {
    e.currentTarget.style.color = buttonStyle.color as string;
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <ExamplePreview {...props} type={activeType} />
      <div
        style={{
          position: 'absolute',
          bottom: 10,
          right: 10,
          display: 'flex',
          gap: 6,
          zIndex: 10,
        }}
      >
        <button
          className="preview-btn"
          onClick={toggle}
          onMouseEnter={hover}
          onMouseLeave={unhover}
          style={buttonStyle}
        >
          ⇄ {activeType === 'vanilla' ? 'three' : 'react'}
        </button>
        <button
          className="preview-btn"
          onClick={goFullscreen}
          onMouseEnter={hover}
          onMouseLeave={unhover}
          style={buttonStyle}
          title="Fullscreen"
        >
          ⛶
        </button>
      </div>
    </div>
  );
}

export default import.meta.env.DEV ? DevExamplePreview : ExamplePreview;
