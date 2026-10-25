// components/local-copy/LocalCopy.tsx
// Places where the desktop app adds its own controls to these screens (keeping a secret or a website login on the person's own PC).
// On the web every one of them renders nothing. The desktop app answers this module with its own version
// (parasync_desktop: src/renderer/src/shims/localCopy.tsx), so the screens stay identical to the web and the desktop never edits their copies.
// Keep the props below in step with that shim.

export type LocalKind = 'secret' | 'user_secret' | 'browser_access';

export interface LocalLoginField {
  key: string;
  label: string;
  kind?: string;
  secret?: boolean;
  options?: string[];
}

/** Inside a "save a secret / login" dialog: the desktop shows whether to save in the cloud and/or on this PC. */
export function LocalSaveChoice(props: { kind: LocalKind; agentId: string }): React.ReactNode {
  void props;
  return null;
}

/** Under one existing secret or saved login: the desktop shows whether this PC holds its own copy, and lets the person add, replace or remove it. */
export function LocalCopyRow(props: { kind: LocalKind; agentId: string; name: string; label?: string; fields?: LocalLoginField[] }): React.ReactNode {
  void props;
  return null;
}

/** At the foot of the left icon strip, under Sign out: the desktop leaves room there for its version label so the two are not mistaken for each other. */
export function DesktopNavFooter(): React.ReactNode {
  return null;
}

/** In the Account section's menu: the desktop adds an "About this app" entry. */
export function DesktopAccountLinks(): React.ReactNode {
  return null;
}
