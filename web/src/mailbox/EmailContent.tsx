import { useEffect, useState } from 'react';
import { useTheme } from '../design-system';

/** Mail keeps its author styles; the document defaults follow our theme tokens. */
export function EmailContent({ sender, html }: { sender: string; html: string }) {
  const { theme } = useTheme();
  const [document, setDocument] = useState('');
  useEffect(() => {
    const tokens = getComputedStyle(window.document.documentElement);
    const token = (name: string) => tokens.getPropertyValue(name).trim();
    setDocument(`<!doctype html><html><head><meta name="color-scheme" content="${theme}"><style>
      body { font-family:${token('--font-sans')}; font-size:${token('--font-size-body')}; line-height:${token('--line-height-reading')}; color:${token('--color-email-text')}; background:${token('--color-email-surface')}; margin:0; overflow-wrap:anywhere }
      a { color:${token('--color-email-link')} } table,img { max-width:100% }
      blockquote { border-left:2px solid ${token('--color-email-border')}; padding-left:${token('--space-4')}; margin-left:0 }
    </style></head><body>${html}</body></html>`);
  }, [html, theme]);
  return (
    <iframe
      title={`Email from ${sender}`}
      className="email-html"
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      srcDoc={document}
    />
  );
}
