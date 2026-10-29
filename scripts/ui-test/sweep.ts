// scripts/ui-test/sweep.ts
// @ts-nocheck
// Opens every screen of the BUILT desktop app against a fake Supabase and a fake web API (no real data, no credentials), takes a
// screenshot of each and fails on any page error. Run:  npm run build && NODE_PATH=$(npm root -g) xvfb-run -a -s "-screen 0 1440x900x24" node scripts/ui-test/sweep.ts
// Needs Playwright installed globally and the Electron binary (npm install downloads it). The fake data is deliberately realistic:
// the web's screens expect full rows, and a missing field crashes a screen (that is the test data's fault, not the app's).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url); // finds playwright through NODE_PATH (see docs/HANDOFF.md, "Testing the screens")
const { _electron: electron } = require('playwright');
const http = require('http');
const OUT = process.env.UI_TEST_OUT ?? '/tmp/ui-test-out';
require('fs').mkdirSync(OUT, { recursive: true });
const now = Date.now();
const iso = (m) => new Date(now - m * 60000).toISOString();
const TOKEN = 'eyAAAAAAAAAA.eyBBBBBBBBBB.CCCCCCCCCCCC';
const day = (n) => { const d = new Date(now - n * 86400000); return d.toISOString().slice(0, 10); };

// ── fake web API (what the desktop app calls through its main process) ──
const apiLog = [];
const secretPosts = [];
const api = http.createServer((req, res) => {
  if (req.method === 'POST') { let raw = ''; req.on('data', (c) => { raw += c; }); req.on('end', () => { if (/\/secrets$/.test(req.url)) secretPosts.push(raw); }); }
  apiLog.push(`${req.method} ${req.url} auth=${(req.headers.authorization || '').slice(0, 14)}`);
  const ok = req.headers.authorization === `Bearer ${TOKEN}`;
  const j = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (!ok) return j(401, { error: 'Not signed in.' });
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api/platform-tools') return j(200, { tools: [{ key: 'code_executor', name: 'Code executor', description: 'Run Python in an isolated sandbox.' }, { key: 'send_email', name: 'Send email', description: 'Email from the agent\'s own address.' }, { key: 'create_excel', name: 'Excel documents', description: 'Create and edit spreadsheets.' }] });
  if (u.pathname === '/api/signed-apis') return j(200, { providers: [{ key: 'aws', name: 'Amazon Athena', description: 'Run SQL on S3 data.', fields: [{ name: 'access_key_id', label: 'Access key ID', required: true, secret: true }, { name: 'region', label: 'Region', required: true, secret: false }], actions: [{ name: 'athena_run_query', description: 'Run a SQL query' }] }, { key: 'snowflake', name: 'Snowflake', description: 'Run SQL.', fields: [], actions: [{ name: 'run_sql_query', description: 'Run SQL' }] }] });
  if (u.pathname === '/api/agents/22222222-2222-4222-8222-2222222222a1/network') return j(200, { ok: true, connections: [{ id: 'c1', status: 'active', source: 'invite', connected_at: iso(9000), email: 'priya@zenith.co', usage: { calls: 42, cost: 1.2345, lastActive: iso(30) }, tasks: { open: 2, recurring: 1 } }], total: 1, active: 1, paused: 0, totals: { calls: 42, cost: 1.2345 }, windowDays: 30, hasMore: false });
  if (u.pathname === '/api/agents/22222222-2222-4222-8222-2222222222a1/workspace/list') return u.searchParams.get('project')
    ? j(200, { ok: true, files: [{ path: 'weekly-reports/stock-summary.xlsx', purpose: 'Weekly stock summary', tags: null, project: 'weekly-reports', is_generated_document: true, is_user_upload: false, file_size_bytes: 20480, mime_type: 'x', updated_at: iso(60) }] })
    : j(200, { ok: true, projects: [{ slug: 'weekly-reports', purpose: 'Stock summaries for the buyers', updated_at: iso(60), file_count: 1 }] });
  if (req.method === 'POST' && /\/api\/agents\/22222222-2222-4222-8222-2222222222a1\/secrets$/.test(u.pathname)) return j(200, { ok: true, name: 'API_KEY', version: 2, storage: 'cloud' });
  if (req.method === 'POST' && /\/secrets\/verify$/.test(u.pathname)) return j(200, { ok: true, exists: true, match: true, version: 2, storage: 'cloud' });
  j(404, { error: 'nope' });
});

// ── fake Supabase REST ──
const T = {
  organizations: [{ id: 'o1', name: 'Acme Herbals', description: 'Herbal supplements', owner_id: '11111111-1111-4111-8111-1111111111aa', slug: 'acme', created_at: iso(90000), timezone: 'Asia/Kolkata' }],
  agents: [
    { id: '22222222-2222-4222-8222-2222222222a1', org_id: 'o1', name: 'Inventory Agent', description: 'Watches stock levels', goal: 'Keep stock healthy', role: 'Inventory analyst', backstory: 'You are careful and exact.', bio: 'online', active: true, visibility: 'private', is_verified: false, avatar_url: null, handle: 'ag-k7m2x9qd', billing_mode: 'owner_pays', created_at: iso(50000), agent_subscriptions: { current_period_end: new Date(now + 20 * 86400000).toISOString() } },
    { id: 'a2', org_id: 'o1', name: 'Finance Agent', description: 'Reconciles payments', goal: 'x', role: 'r', backstory: 'b', bio: null, active: false, visibility: 'personal', is_verified: false, avatar_url: null, handle: 'ag-aaaaaaaa', billing_mode: 'user_pays', created_at: iso(40000), agent_subscriptions: null },
  ],
  agent_network: [], chats: [{ id: 'c1', agent_id: '22222222-2222-4222-8222-2222222222a1', orchestrator_status: 'idle', created_by: '11111111-1111-4111-8111-1111111111aa' }],
  profiles: [{ id: '11111111-1111-4111-8111-1111111111aa', name: 'Test User', avatar: null, created_at: iso(99000) }],
  wallets: [{ balance_credits: 12.3456 }],
  wallet_transactions: [{ id: 't1', amount: 10, reference_id: 'pay_ABC123', created_at: iso(5000), type: 'credit' }],
  invoices: [{ id: 'i1', invoice_number: 'PS-2026-000123', amount: 10, currency: 'USD', issued_at: iso(5000), reference_id: 'pay_ABC123' }],
  agent_platform_tools: [{ agent_id: '22222222-2222-4222-8222-2222222222a1', tool_key: 'code_executor', enabled: true, available_to_members: true }, { agent_id: '22222222-2222-4222-8222-2222222222a1', tool_key: 'send_email', enabled: true, available_to_members: false }, { agent_id: '22222222-2222-4222-8222-2222222222a1', tool_key: 'whatsapp_chats', enabled: true, available_to_members: false }],
  instructions: [{ id: 'n1', title: 'Always cite the sheet', content: 'When you report stock, name the sheet and the row.\nNever guess a number.', enabled: true, available_to_members: true, created_at: iso(30000) }],
  tools: [{ id: 'tl1', name: 'check_inventory', description: 'Reads stock levels from the warehouse sheet.', enabled: true, available_to_members: true, config: { variables: [{ name: 'sku', required: true }, { name: 'warehouse', required: false }], timeout_seconds: 120, code: "def run(sku, warehouse=None):\n    return {'sku': sku, 'qty': 14}" } }],
  agent_created_tools: [{ id: 'ct1', name: 'weekly_summary', description: 'Builds the weekly summary.', enabled: true, available_to_members: false, usage_count: 7, config: { code: 'print(1)' } }],
  secrets: [{ id: 's1', name: 'WAREHOUSE_API_KEY', context: 'Warehouse system key', created_at: iso(20000), agent_importable: false, allowed_hosts: ['api.warehouse.example'] }],
  agent_user_secret_defs: [{ id: 'd1', name: 'BINANCE_API_KEY', context: 'Your own key', required: true, created_at: iso(10000), allowed_hosts: [], agent_importable: true }],
  agent_signed_apis: [{ agent_id: '22222222-2222-4222-8222-2222222222a1', provider_key: 'aws', enabled: true, available_to_members: true }],
  agent_signed_api_credentials: [{ provider_key: 'aws', fields: { access_key_id: 'x', region: 'y' } }],
  agent_mcp_servers: [{ id: 'm1', name: 'GitHub', url: 'https://mcp.github.example/v1', auth_type: 'oauth', enabled: true, available_to_members: false, tools_cache: [{ name: 'list_issues', description: 'List issues in a repo' }, { name: 'create_issue', description: 'Open an issue' }], tools_cached_at: iso(300), oauth_expires_at: null, needs_reconnect: false }],
  browser_accesses: [{ id: 'b1', name: 'vendor-portal', label: 'Vendor portal', host: 'portal.vendor.example', status: 'ready', enabled: true, available_to_members: false, coverage_pct: 62.4, last_verified_at: iso(200), last_error: null }],
  tasks: [{ id: 'k1', org_id: 'o1', agent_id: '22222222-2222-4222-8222-2222222222a1', created_by: '11111111-1111-4111-8111-1111111111aa', chat_id: 'c1', definition: 'Every weekday at 9am check inventory and email the buyers a summary of anything below threshold', trigger_type: 'cron', cron_expression: '0 9 * * 1-5', next_run_at: iso(-600), status: 'planned', active_chain_id: null, run_count: 12, last_run_at: iso(900), last_error: null, delivery: 'notification', project_id: null, created_at: iso(4000), updated_at: iso(900), completed_at: null }],
  shifts: [{ id: 'sh1', org_id: 'o1', agent_id: '22222222-2222-4222-8222-2222222222a1', created_by: '11111111-1111-4111-8111-1111111111aa', name: 'Night watch', definition: 'Watch prices overnight', status: 'planned', spec: null, last_error: null, plan_attempts: 0, next_start_at: iso(-300), retired_at: null, created_at: iso(3000), updated_at: iso(3000), report_instructions: null, plan_feedback: null, sop_status: null, arena_state: null, learn_wakes: 0, learn_note: null, opening: null }],
  agent_projects: [{ id: 'p1', org_id: 'o1', agent_id: '22222222-2222-4222-8222-2222222222a1', created_by: '11111111-1111-4111-8111-1111111111aa', chat_id: 'c1', kind: 'project', title: 'Q4 reorder plan', goal: 'Plan all Q4 reorders', status: 'active', starts_at: iso(2000), ends_at: iso(-9000), plan: [], outcome: null, report: null, last_error: null, hold_reason: null, wake_count: 2, task_count: 3, message_count: 4, next_wake_at: iso(-60), created_at: iso(2000), ended_at: null }],
  task_runs: [],
  agent_email_settings: [{ allow_any_recipient: false, allowed_recipients: ['buyers@acme.co', 'cfo@acme.co'], daily_cap: 50, reply_to_mode: 'owner', suspended: false, suspended_reason: null }],
  agent_emails: [{ id: 'e1', created_at: iso(120), to_addresses: ['buyers@acme.co'], subject: 'Weekly stock summary', body_text: 'Hi team,\nBrahmi is low (14).', status: 'delivered', error: null, from_address: 'ag-k7m2x9qd@mails.parasync.in', attachments: [{ filename: 'stock.xlsx' }] }],
  wa_connection_status: [{ status: 'connected', phone_number: '919876543210', push_name: 'Acme Ops', last_connected_at: iso(500), last_error: null, stop_reason: null, messages_stored: 128 }],
  wa_chats: [], agent_invites: [{ id: 'iv1', invited_email: 'ravi@zenith.co', code: 'K7M2X9QD', status: 'pending', created_at: iso(4000) }],
  agent_subscriptions: [{ current_period_end: new Date(now + 20 * 86400000).toISOString() }],
  messages: [{ id: 'm3', role: 'assistant', content: 'Hello!', status: 'completed', created_at: iso(5), metadata: null, private: false }],
  agent_notifications: [], marketplace_agents: [], my_agent_invites: [], shift_runs: [],
};
const USAGE = []; for (let i = 0; i < 40; i++) USAGE.push({ day: day(i), agent_id: i % 3 ? '22222222-2222-4222-8222-2222222222a1' : 'a2', agent_name: i % 3 ? 'Inventory Agent' : 'Finance Agent', source: i % 4 ? 'chat' : 'scheduled_task', cost: 0.05 + (i % 7) * 0.02, calls: 4 + (i % 5), prompt_tokens: 12000, completion_tokens: 3000 });

(async () => {
  await new Promise((r) => api.listen(54701, r));
  const app = await electron.launch({ executablePath: require('path').resolve(import.meta.dirname, '../../node_modules/electron/dist/electron'), args: ['--no-sandbox', '--disable-gpu', require('path').resolve(import.meta.dirname, '../..')], env: { ...process.env, PARASYNC_WEB_URL: 'http://127.0.0.1:54701', PARASYNC_TEST_PLAINTEXT_VAULT: '1' } });
  const win = await app.firstWindow(); win.setDefaultTimeout(4000);
  const errors = [];
  win.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  win.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|realtime|ERR_|fonts.googleapis.com/i.test(m.text())) errors.push('console: ' + m.text()); });
  const unmocked = new Set();
  await app.context().route('**/*.supabase.co/**', async (route) => {
    const req = route.request(); const u = new URL(req.url());
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const rpc = /\/rest\/v1\/rpc\/([a-z_]+)/.exec(u.pathname);
    const headers = { ...cors, 'content-type': 'application/json' };
    if (rpc) return route.fulfill({ status: 200, headers, body: JSON.stringify(rpc[1] === 'account_usage_series' ? USAGE : []) });
    const m = /\/rest\/v1\/([a-z_]+)/.exec(u.pathname);
    if (!m) return route.fulfill({ status: 404, headers: cors, body: '{}' });
    const table = m[1];
    if (!(table in T)) unmocked.add(table);
    let rows = T[table] ?? [];
    const eq = (k) => u.searchParams.get(k)?.replace(/^eq\./, '');
    if (['agents', 'chats'].includes(table) && eq('id')) rows = rows.filter((r) => r.id === eq('id'));
    if (table === 'agents' && !eq('id') && u.searchParams.get('org_id')?.startsWith('in.')) rows = rows;
    if (req.method() === 'HEAD' || (req.headers()['prefer'] || '').includes('count=exact')) headers['content-range'] = `0-0/${rows.length}`;
    if (req.method() === 'HEAD') return route.fulfill({ status: 200, headers });
    if (req.method() === 'PATCH') return route.fulfill({ status: 204, headers: cors });
    if ((req.headers()['accept'] || '').includes('vnd.pgrst.object')) return rows[0] ? route.fulfill({ status: 200, headers, body: JSON.stringify(rows[0]) }) : route.fulfill({ status: 406, headers, body: JSON.stringify({ code: 'PGRST116', message: 'none' }) });
    return route.fulfill({ status: 200, headers, body: JSON.stringify(rows) });
  });
  await win.waitForLoadState('domcontentloaded');
  const session = { access_token: TOKEN, refresh_token: 'r', expires_in: 3600, expires_at: Math.floor(now / 1000) + 3600, token_type: 'bearer', user: { id: '11111111-1111-4111-8111-1111111111aa', aud: 'authenticated', email: 'tester@example.com', app_metadata: {}, user_metadata: {}, created_at: iso(99999) } };
  await win.evaluate((s) => window.parasync.storage.set('sb-eyufwzhxxfebncwaxgci-auth-token', JSON.stringify(s)), session);
  await win.reload(); await win.waitForTimeout(2000);
  const shot = async (name) => { await win.waitForTimeout(1500); await win.screenshot({ path: `${OUT}/${name}.png` }); };
  const results = [];
  const check = async (label, fn) => { const before = errors.length; try { await fn(); } catch (e) { errors.push(`STEP ${label}: ${String(e.message).split('\n').slice(0, 3).join(' | ')}`); await win.screenshot({ path: `${OUT}/FAIL_${label.replace(/\W+/g, '_')}.png` }).catch(() => undefined); } results.push(`${errors.length === before ? 'ok  ' : 'FAIL'} ${label}`); };
  const fresh = async () => { await win.reload(); await win.waitForTimeout(1600); };
  const toSettings = async () => { await win.getByText('Inventory Agent').first().click(); await win.waitForTimeout(900); await win.mouse.click(490, 64); await win.waitForTimeout(900); };
  for (const label of ['Runsheet', 'Platform Tools', 'WhatsApp', 'Tool Builder', 'Instructions', 'Secrets', 'Database Integrations', 'MCP', 'Browser Access', 'Add Users', 'Workspace', 'Agent Profile']) {
    await check('tab ' + label, async () => { await fresh(); await toSettings(); await win.getByText(label, { exact: true }).first().click(); await shot('x_tab_' + label.replace(/\W+/g, '_')); });
  }
  for (const [title, file] of [['Account', 'x_account'], ['Marketplace', 'x_market'], ['Requests', 'x_requests']]) {
    await check(title, async () => { await fresh(); await win.getByTitle(title).click(); await shot(file); });
  }
  await check('account pages', async () => { await fresh(); await win.getByTitle('Account').click(); await win.waitForTimeout(1200); for (const label of ['Billing', 'Usage', 'Profile']) { await win.getByText(label, { exact: true }).first().click(); await shot('x_acct_' + label); } });
  await check('about page', async () => { await fresh(); await win.getByLabel('About this app').click(); await shot('x_about'); });
  await check('secrets: choose where to keep it, add/replace/remove a copy on this PC', async () => {
    await fresh(); await toSettings(); await win.getByText('Secrets', { exact: true }).first().click(); await win.waitForTimeout(900);
    // an existing secret has no copy here yet
    await win.getByText('No copy on this PC').first().waitFor();
    await win.getByText('Add for this PC').first().click();
    await win.locator('input[type=password]').last().fill('sk-live-0123456789');
    await win.getByRole('button', { name: 'Keep on this PC' }).click(); await win.waitForTimeout(1200);
    await win.getByText('Copy kept on this PC').first().waitFor();
    await shot('x_secret_copy_added');
    // a new secret: cloud + this PC (default)
    await win.getByRole('button', { name: /New secret/ }).click(); await win.waitForTimeout(500);
    await win.getByPlaceholder('e.g. STRIPE_API_KEY').fill('both_key');
    await win.locator('input[name=secret-value-field]').fill('both-value-123456');
    await win.getByText('Keep a copy on this PC').waitFor();
    await shot('x_secret_new_dialog');
    await win.getByRole('button', { name: 'Add secret' }).click(); await win.waitForTimeout(1500);
    // a new secret kept on this PC only: the cloud is sent just the name
    await win.getByRole('button', { name: /New secret/ }).click(); await win.waitForTimeout(500);
    await win.getByPlaceholder('e.g. STRIPE_API_KEY').fill('pc_only_key');
    await win.locator('input[name=secret-value-field]').fill('pc-only-value-123456');
    await win.getByLabel(/Save in Parasync/).uncheck();
    await win.getByRole('button', { name: 'Add secret' }).click(); await win.waitForTimeout(1500);
    const sent = secretPosts.map((x) => JSON.parse(x));
    const both = sent.find((x) => x.name === 'BOTH_KEY'); const only = sent.find((x) => x.name === 'PC_ONLY_KEY');
    if (!both || both.value !== 'both-value-123456') throw new Error('the cloud did not get the value for a cloud+PC secret: ' + JSON.stringify(both));
    if (!only || 'value' in only || only.storage !== 'device_only') throw new Error('a PC-only secret must reach the cloud as a name only: ' + JSON.stringify(only));
    const list = await win.evaluate(() => window.parasync.vault.list());
    const names = list.map((e) => e.name).sort().join(',');
    if (names !== 'BOTH_KEY,PC_ONLY_KEY,WAREHOUSE_API_KEY') throw new Error('this PC holds: ' + names);
    if (/sk-live-0123456789|both-value-123456|pc-only-value-123456/.test(JSON.stringify(list))) throw new Error('a value came back to the page');
    // the About page lists them, and removes one
    await fresh(); await win.getByLabel('About this app').click(); await win.waitForTimeout(1000);
    await win.getByText('Kept on this PC').waitFor(); await win.getByText('BOTH_KEY', { exact: false }).first().waitFor();
    await shot('x_vault');
    await win.getByRole('button', { name: 'Remove', exact: true }).first().click(); await win.waitForTimeout(800);
    await win.evaluate(() => window.parasync.vault.wipe());
  });
  await check('account menu has About this app', async () => {
    await fresh(); await win.getByTitle('Account').click(); await win.waitForTimeout(1000);
    await win.getByRole('button', { name: 'About this app' }).first().click(); await win.waitForTimeout(800);
    await win.getByText('Kept on this PC').waitFor();
  });
  console.log(results.join('\n'));
  console.log('web api calls:', apiLog.filter((l, i, a) => a.indexOf(l) === i));
  console.log('unmocked tables hit:', [...unmocked]);
  console.log('ERRORS:', errors);
  await app.close(); api.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
