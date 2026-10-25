// src/main/runner/localSecrets.ts
// How a job asks for secrets that this PC holds. The cloud never sends a secret value down: a job carries only NAMES (and the version the
// cloud expects), under the key `local_secrets`. The executor resolves them from the vault, hands them to the script for that one run, and
// blanks them from the answer. Everything here is checked strictly, because the job comes from a mailbox row.
import { SECRET_KINDS, isUnsafeEnvName, type Ref, type SecretKind } from '../../shared/vault';
import { validateRef } from '../vault/vault';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{16,200}$/;
export const MAX_ENV_SECRETS = 50;
export const MAX_BROKER_SECRETS = 20;

export interface WantedSecret extends Ref {
  version?: number;
}

export interface BrokerWanted extends WantedSecret {
  hosts: string[];
}

export interface LocalSecretsSpec {
  agentId: string;
  /** Handed to the script as plain environment variables, under their own names (Tool Builder tools, whose code an admin fixed). */
  env: WantedSecret[];
  /** Kept out of the script's reach: model-written code calls a broker that adds the value to its outgoing request. */
  broker: { names: BrokerWanted[]; cloud: { url: string; token: string } | null } | null;
  /** A saved website login, given to the platform's own login script as one JSON environment variable. Browser calls only. */
  credentials: (Ref & { version?: number }) | null;
}

function version(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 1_000_000_000) throw new Error('invalid version');
  return v;
}

function wanted(raw: unknown, agentId: string, kinds: readonly SecretKind[]): WantedSecret {
  const o = (raw ?? {}) as { kind?: unknown; name?: unknown; version?: unknown };
  const ref = validateRef({ agentId, kind: o.kind, name: o.name });
  if (!kinds.includes(ref.kind)) throw new Error('not allowed here');
  return { ...ref, version: version(o.version) };
}

/** Returns the checked request, null when the job asks for no secrets, or throws an Error whose message is safe to show. */
export function parseLocalSecrets(raw: unknown): LocalSecretsSpec | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error('local_secrets must be an object');
  const o = raw as Record<string, unknown>;
  const agentId = typeof o['agent_id'] === 'string' && UUID.test(o['agent_id']) ? o['agent_id'].toLowerCase() : null;
  if (!agentId) throw new Error('local_secrets has no valid agent');

  const envRaw = o['env'] === undefined ? [] : o['env'];
  if (!Array.isArray(envRaw) || envRaw.length > MAX_ENV_SECRETS) throw new Error('local_secrets.env is invalid');
  const env = envRaw.map((e) => wanted(e, agentId, ['secret', 'user_secret']));
  for (const e of env) if (isUnsafeEnvName(e.name)) throw new Error(`"${e.name}" cannot be used as an environment variable name`);
  if (new Set(env.map((e) => e.name)).size !== env.length) throw new Error('duplicate secret names');

  let broker: LocalSecretsSpec['broker'] = null;
  if (o['broker'] !== undefined && o['broker'] !== null) {
    const b = o['broker'] as { names?: unknown; cloud?: unknown };
    if (!b || typeof b !== 'object' || !Array.isArray(b.names) || b.names.length > MAX_BROKER_SECRETS) throw new Error('local_secrets.broker is invalid');
    const names: BrokerWanted[] = b.names.map((n) => {
      const w = wanted(n, agentId, ['secret', 'user_secret']);
      const hosts = (n as { hosts?: unknown }).hosts;
      if (!Array.isArray(hosts) || hosts.length > 20 || !hosts.every((h) => typeof h === 'string' && h.length <= 253)) throw new Error('invalid hosts');
      return { ...w, hosts: hosts.map((h: string) => h.toLowerCase()) };
    });
    let cloud: { url: string; token: string } | null = null;
    if (b.cloud !== undefined && b.cloud !== null) {
      const c = b.cloud as { url?: unknown; token?: unknown };
      if (typeof c.url !== 'string' || typeof c.token !== 'string' || !TOKEN.test(c.token)) throw new Error('invalid cloud broker');
      const u = new URL(c.url);
      if (u.protocol !== 'https:' || u.username || u.password) throw new Error('the cloud broker must be an https address');
      cloud = { url: u.origin, token: c.token };
    }
    broker = { names, cloud };
  }

  let credentials: LocalSecretsSpec['credentials'] = null;
  if (o['credentials'] !== undefined && o['credentials'] !== null) {
    const c = o['credentials'] as { access_id?: unknown; version?: unknown };
    const ref = validateRef({ agentId, kind: 'browser_access', name: c.access_id });
    credentials = { ...ref, version: version(c.version) };
  }

  if (env.length === 0 && !broker && !credentials) return null;
  return { agentId, env, broker, credentials };
}

export const KINDS = SECRET_KINDS;

/** What the Linux box's local broker is given for one run (it lives in the broker's memory only, never in the script's environment). */
export interface BrokerSecrets {
  secrets: { name: string; value: string; hosts: string[] }[];
  /** Calls that name no local secret are passed on to the cloud's own broker with this token. */
  cloud: { url: string; token: string } | null;
}
