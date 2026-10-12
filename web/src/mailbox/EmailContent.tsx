import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../design-system';

/** Author CSS stays inside a script-disabled frame, never in the application DOM. */
export function EmailContent({ sender, html }: { sender: string; html: string }) {
  const { theme } = useTheme();
  const frame = useRef<HTMLIFrameElement>(null);
  const cleanup = useRef<() => void>(() => {});
  const [document, setDocument] = useState('');
  const [showImages, setShowImages] = useState(false);
  const hasImages = /<img\b|url\s*\(/i.test(html);
  useEffect(() => {
    setShowImages(false);
  }, [html]);
  useEffect(() => {
    const tokens = getComputedStyle(window.document.documentElement);
    const token = (name: string) => tokens.getPropertyValue(name).trim();
    const images = showImages ? 'https: http: data:' : 'data:';
    setDocument(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="${theme}"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src ${images}; base-uri 'none'; form-action 'none'"><style>
      body { font-family:${token('--font-sans')}; font-size:${token('--font-size-body')}; line-height:${token('--line-height-reading')}; color:${token('--color-email-text')}; background:${token('--color-email-surface')}; margin:0; overflow-wrap:anywhere }
      a { color:${token('--color-email-link')} } img { max-width:100% }
      blockquote { border-left:2px solid ${token('--color-email-border')}; padding-left:${token('--space-4')}; margin-left:0 }
    </style></head><body><div id="mailthing-content">${html}</div></body></html>`);
  }, [html, theme, showImages]);
  useEffect(() => () => cleanup.current(), []);

  function fitContent() {
    cleanup.current();
    const iframe = frame.current;
    const doc = iframe?.contentDocument;
    const content = doc?.getElementById('mailthing-content');
    if (!iframe || !doc || !content) return;
    let pending = 0;
    function measure() {
      pending = 0;
      if (!iframe || !content) return;
      const viewport = iframe.clientWidth;
      if (!viewport) return;
      content.style.display = 'flow-root';
      content.style.width = `${viewport}px`;
      content.style.zoom = '1';
      const naturalWidth = Math.max(viewport, content.scrollWidth);
      content.style.width = `${naturalWidth}px`;
      content.style.zoom = `${viewport / naturalWidth}`;
      iframe.style.height = `${Math.ceil(content.getBoundingClientRect().height) + 1}px`;
    }
    function schedule() {
      if (!pending) pending = requestAnimationFrame(measure);
    }
    const observer = new ResizeObserver(schedule);
    observer.observe(content);
    // Observe width changes without responding to our own iframe height updates.
    let width = iframe.clientWidth;
    const viewportObserver = new ResizeObserver(() => {
      if (iframe.clientWidth !== width) {
        width = iframe.clientWidth;
        schedule();
      }
    });
    viewportObserver.observe(iframe);
    doc.addEventListener('load', schedule, true);
    doc.addEventListener('error', schedule, true);
    schedule();
    cleanup.current = () => {
      observer.disconnect();
      viewportObserver.disconnect();
      doc.removeEventListener('load', schedule, true);
      doc.removeEventListener('error', schedule, true);
      cancelAnimationFrame(pending);
    };
  }

  return (
    <div className="email-content">
      {hasImages && (
        <div className="email-image-controls">
          <span>{showImages ? 'Remote images are shown.' : 'Remote images are hidden.'}</span>
          <button type="button" onClick={() => setShowImages(!showImages)}>
            {showImages ? 'Hide images' : 'Show images'}
          </button>
        </div>
      )}
      <iframe
        ref={frame}
        title={`Email from ${sender}`}
        className="email-html"
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        srcDoc={document}
        onLoad={fitContent}
        referrerPolicy="no-referrer"
      />
    </div>
  );
}
