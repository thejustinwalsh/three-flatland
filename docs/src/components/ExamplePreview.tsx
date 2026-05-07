import { useState, useRef, useCallback, useEffect } from 'react';

interface Props {
  type: 'three' | 'react';
  name: string;
  height?: number;
  /** Match the example's clear color so the placeholder blends in */
  bg?: string;
}

const EXAMPLES_PORT = import.meta.env.VITE_EXAMPLES_PORT;

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

function ExamplePreview({ type, name, height = 720, bg = '#1a1a2e' }: Props) {
  const isDev = import.meta.env.DEV;
  const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');

  // In dev, point directly at the examples Vite server instead of the
  // microfrontend proxy. Going through the proxy causes Vite's absolute
  // dep URLs (/node_modules/.vite/deps/...) to be routed to the wrong app.
  // Port comes from microfrontends.json via Vite define.
  const src = isDev
    ? `http://localhost:${EXAMPLES_PORT}/${type}/${name}/`
    : `${base}examples/${type}/${name}/`;

  // View-transition name is derived from the slug so it pairs with
  // the masonry tile on `/examples/`. The browser morphs the tile's
  // bounding box into the iframe's bounding box on navigation.
  const transitionName = `tile-examples-${name}`;

  return (
    <iframe
      src={src}
      style={{
        width: '100%',
        height,
        border: 'none',
        borderRadius: '12px',
        background: bg,
        colorScheme: 'dark',
        viewTransitionName: transitionName,
      }}
      title={`${type}/${name} preview`}
      allow="cross-origin-isolated"
    />
  );
}

const STORAGE_KEY = 'flatland-example-type';

function getStoredType(): 'three' | 'react' | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'three' || v === 'react' ? v : null;
  } catch { return null; }
}

function DevExamplePreview(props: Props) {
  // Render a placeholder until we've read localStorage on the client.
  // Avoids the SSR-then-flash where the iframe loads the prop type first
  // and then re-navigates to the saved type.
  const [activeType, setActiveType] = useState<'three' | 'react' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActiveType(getStoredType() ?? props.type);
  }, [props.type]);

  const toggle = () =>
    setActiveType((t) => {
      const next = t === 'three' ? 'react' : 'three';
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

  const hover = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.color = 'rgba(240, 237, 216, 0.9)';
  };
  const unhover = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.color = buttonStyle.color as string;
  };

  // Same slug-derived transition name as the production iframe — keeps
  // the morph from the masonry tile target consistent across both
  // dev and prod views.
  const transitionName = `tile-examples-${props.name}`;

  if (activeType === null) {
    return (
      <div
        style={{
          width: '100%',
          height: props.height ?? 720,
          background: props.bg ?? '#1a1a2e',
          borderRadius: '12px',
          viewTransitionName: transitionName,
        }}
      />
    );
  }

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
          ⇄ {activeType}
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
