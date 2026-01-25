interface Props {
  type: 'vanilla' | 'react';
  name: string;
  height?: number;
}

export default function ExamplePreview({ type, name, height = 600 }: Props) {
  const isDev = import.meta.env.DEV;
  const base = import.meta.env.BASE_URL;

  // Dev: iframe to microfrontend proxy (port 5173)
  // Prod: iframe to built static files
  const src = isDev
    ? `http://localhost:5173/${type}/${name}/`
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
