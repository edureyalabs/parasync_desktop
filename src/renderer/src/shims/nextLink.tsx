// src/renderer/src/shims/nextLink.tsx
// Stands in for Next.js's <Link> so the web app's screens run unchanged: an address inside the app changes the screen,
// an outside one opens in the person's browser.
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react';

import { useRouter } from '~/shims/nextNavigation';

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  href: string | { pathname?: string };
  replace?: boolean;
  prefetch?: boolean;
  scroll?: boolean;
  shallow?: boolean;
  passHref?: boolean;
  children?: ReactNode;
}

export default function Link({ href, replace, prefetch: _prefetch, scroll: _scroll, shallow: _shallow, passHref: _passHref, onClick, children, ...rest }: LinkProps) {
  const router = useRouter();
  const target = typeof href === 'string' ? href : (href.pathname ?? '/');
  const external = /^(https?:|mailto:)/i.test(target);

  const handle = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (external) void window.parasync.openExternal(target).catch(() => undefined);
    else if (replace) router.replace(target);
    else router.push(target);
  };

  return <a {...rest} href={target} onClick={handle}>{children}</a>;
}
