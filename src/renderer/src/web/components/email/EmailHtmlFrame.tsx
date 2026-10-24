// components/email/EmailHtmlFrame.tsx
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// Shows an email's formatted (HTML) body. The HTML was written by an AI agent and may quote text it read elsewhere, so it is treated as untrusted:
//  - it renders inside a sandboxed iframe with NO scripts and no forms (the sandbox omits allow-scripts / allow-forms); allow-same-origin is there only so this
//    component can read the frame's height, which is safe because nothing inside the frame can run code;
//  - a Content-Security-Policy meta tag blocks everything except inline styles and https/data images and fonts, and `base-uri 'none'` stops a <base> override;
//  - links open in a new tab (the frame's own <base target="_blank">), and that tab is not sandboxed by us (allow-popups-to-escape-sandbox).
// Images are loaded from their own addresses, the same as in a mail client; the agent's picture (attached inline to the real email) is not part of the stored body.

const CSP = "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src https: data:; base-uri 'none'; form-action 'none'";

function buildDocument(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}"><base target="_blank">`
    + '<style>html,body{margin:0;padding:0;background:#fff}body{font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#26251E;word-wrap:break-word;overflow-wrap:anywhere}'
    + 'img{max-width:100%;height:auto}table{max-width:100%}</style></head><body>'
    + html
    + '</body></html>';
}

export function EmailHtmlFrame({ html, title }: { html: string; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(240);
  const doc = useMemo(() => buildDocument(html), [html]);

  const measure = useCallback(() => {
    const root = ref.current?.contentDocument?.documentElement;
    if (root) setHeight(Math.max(120, Math.ceil(root.scrollHeight)));
  }, []);

  // Images change the height as they arrive, and a narrower pane re-wraps the text.
  const onLoad = useCallback(() => {
    measure();
    ref.current?.contentDocument?.querySelectorAll('img').forEach(img => img.addEventListener('load', measure));
  }, [measure]);

  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  return (
    <iframe
      ref={ref} title={title} srcDoc={doc} onLoad={onLoad}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      style={{ display: 'block', width: '100%', height, border: 'none', background: '#fff' }}
    />
  );
}
