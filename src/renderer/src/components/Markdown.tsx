// src/renderer/src/components/Markdown.tsx
// Agent replies are untrusted text. This renders markdown (tables included) but never raw HTML, never remote images
// (they could report that a message was read, or load something unexpected) and only opens http(s)/mailto links, in
// the person's browser.
import { memo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

const components: Components = {
  a({ href, children }) {
    const ok = typeof href === 'string' && /^(https?:|mailto:)/i.test(href);
    return (
      <a
        href={ok ? href : undefined}
        onClick={(e) => {
          e.preventDefault();
          if (ok && href) void window.parasync.openExternal(href).catch(() => undefined);
        }}
        title={ok ? href : undefined}
      >
        {children}
      </a>
    );
  },
  img({ alt }) {
    return <span style={{ color: '#9E9C8F', fontStyle: 'italic' }}>[image{alt ? `: ${alt}` : ''}]</span>;
  },
  table({ children }) {
    return (
      <div className="ps-table-wrap">
        <table>{children}</table>
      </div>
    );
  },
};

function MarkdownImpl({ children }: { children: string }) {
  return (
    <div className="ps-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
        {children}
      </ReactMarkdown>
    </div>
  );
}

export const Markdown = memo(MarkdownImpl);
