// src/renderer/src/shims/supabaseClient.ts
// The web app creates a Supabase client wherever it needs one (`createClient()`). Here every call returns the app's single
// client, so there is one sign-in, one token refresh and one connection. The only difference from separate clients is
// that realtime channel names must not collide, so each channel gets a unique suffix (the name is only a local label).
import type { SupabaseClient } from '@supabase/supabase-js';

import { supabase } from '~/lib/supabase';

let counter = 0;

const client: SupabaseClient = new Proxy(supabase, {
  get(target, prop, receiver) {
    if (prop === 'channel') {
      return (name: string, opts?: Parameters<SupabaseClient['channel']>[1]) => target.channel(`${name}#${++counter}`, opts);
    }
    const value = Reflect.get(target, prop, receiver);
    return typeof value === 'function' ? value.bind(target) : value;
  },
});

export function createClient(): SupabaseClient {
  return client;
}
