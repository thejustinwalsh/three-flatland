import { useState } from 'react';

interface Props {
  type: 'vanilla' | 'react';
  name: string;
  height?: number;
}

function ExamplePreview({ type, name, height = 600 }: Props) {
  const isDev = import.meta.env.DEV;
  // Ensure base URL has trailing slash
  const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');

  // Dev: absolute path — resolved by the microfrontends proxy on the current origin
  // Prod: iframe to built static files
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

function DevExamplePreview(props: Props) {
  const [activeType, setActiveType] = useState(props.type);
  const toggle = () =>
    setActiveType((t) => (t === 'vanilla' ? 'react' : 'vanilla'));

  return (
    <div style={{ position: 'relative' }}>
      <ExamplePreview {...props} type={activeType} />
      <button
        onClick={toggle}
        style={{
          position: 'absolute',
          bottom: 12,
          right: 12,
          padding: '4px 10px',
          background: 'rgba(0, 0, 0, 0.6)',
          color: '#ccc',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: 6,
          fontFamily: 'monospace',
          fontSize: 12,
          cursor: 'pointer',
          zIndex: 10,
        }}
      >
        {activeType}
      </button>
    </div>
  );
}

export default import.meta.env.DEV ? DevExamplePreview : ExamplePreview;
