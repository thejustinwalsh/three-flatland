import { useEffect, useId, useRef, useState } from 'react';
import sdk from '@stackblitz/sdk';
import type { VM } from '@stackblitz/sdk';

interface Props {
  title: string;
  files: Record<string, string>;
  openFile?: string;
  height?: number;
}

// Inject global iframe reset once
if (typeof document !== 'undefined') {
  const styleId = 'stackblitz-iframe-reset';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      iframe[id^="stackblitz-"],
      iframe[id^="sb-"] {
        border: none !important;
      }
    `;
    document.head.appendChild(style);
  }
}

export default function StackBlitzEmbed({
  title,
  files,
  openFile = 'main.ts',
  height = 600,
}: Props) {
  const id = useId();
  const containerId = `sb-${id.replace(/:/g, '')}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const vmRef = useRef<VM | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isVisible, setIsVisible] = useState(false);

  // Only initialize when visible (prevents race conditions with tabs)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    const container = containerRef.current;
    if (!container) return;

    // Skip if no files or already initialized
    const fileCount = Object.keys(files || {}).length;
    if (fileCount === 0) return;
    if (vmRef.current || container.querySelector('iframe')) return;

    let cancelled = false;

    sdk.embedProject(
      container,
      {
        title,
        template: 'node',
        files,
      },
      {
        openFile,
        clickToLoad: false,
        theme: 'dark',
        view: 'editor',
        height,
      }
    ).then((vm) => {
      if (cancelled) return;
      vmRef.current = vm;
      setIsLoading(false);
    }).catch((e) => {
      if (cancelled) return;
      console.error('StackBlitz embed error:', e);
      setIsLoading(false);
    });

    // Cleanup on unmount
    return () => {
      cancelled = true;
    };
  }, [isVisible, title, files, openFile, height]);

  return (
    <>
      <style>{`
        @keyframes sb-spin {
          to { transform: rotate(360deg); }
        }
        .sb-wrapper-${containerId} {
          position: relative;
          height: ${height}px;
          width: 100%;
          background: #1e1e1e;
        }
        .sb-loader-${containerId} {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #1e1e1e;
          z-index: 10;
        }
        .sb-spinner-${containerId} {
          width: 24px;
          height: 24px;
          border: 2px solid #333;
          border-top-color: #888;
          border-radius: 50%;
          animation: sb-spin 0.8s linear infinite;
        }
        #${containerId} {
          height: ${height}px;
          width: 100%;
        }
      `}</style>
      <div className={`sb-wrapper-${containerId}`}>
        {isLoading && (
          <div className={`sb-loader-${containerId}`}>
            <div className={`sb-spinner-${containerId}`} />
          </div>
        )}
        <div ref={containerRef} id={containerId} />
      </div>
    </>
  );
}
