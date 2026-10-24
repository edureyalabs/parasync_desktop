// src/renderer/src/shims/nextNavigation.tsx
// Stands in for Next.js's navigation hooks so the web app's screens run unchanged. The app keeps its own "current address"
// (see router/AppRouter.tsx) and these hooks read and change it.
import { createContext, useContext, useMemo } from 'react';

export interface RouterApi {
  push: (href: string) => void;
  replace: (href: string) => void;
  back: () => void;
  forward: () => void;
  refresh: () => void;
  prefetch: (href: string) => void;
}

export interface NavValue {
  pathname: string;
  search: string;
  params: Record<string, string>;
  api: RouterApi;
}

export const NavContext = createContext<NavValue | null>(null);

function useNav(): NavValue {
  const value = useContext(NavContext);
  if (!value) throw new Error('Navigation hooks must be used inside AppRouter');
  return value;
}

export function useRouter(): RouterApi {
  return useNav().api;
}

export function usePathname(): string {
  return useNav().pathname;
}

export function useParams<T extends Record<string, string> = Record<string, string>>(): T {
  return useNav().params as T;
}

export function useSearchParams(): URLSearchParams {
  const { search } = useNav();
  return useMemo(() => new URLSearchParams(search), [search]);
}

/** Thrown by redirect(); the router catches it and moves to the address. */
export class RedirectSignal extends Error {
  readonly digest = 'PARASYNC_REDIRECT';
  constructor(readonly target: string) {
    super(`Redirect to ${target}`);
  }
}

export function redirect(target: string): never {
  throw new RedirectSignal(target);
}
