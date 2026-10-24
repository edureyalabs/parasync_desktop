// components/tool-builder/ToolGuide.tsx
'use client';

// "How to build tools" -- a button that opens a modal guide to the Tool Builder:
// what a tool is, every input type, results, files, secrets, limits and worked examples.
// Static content only; it reads nothing and calls nothing.
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Icon } from '@/components/icons/Icon';
import { HeaderButton } from '@/components/agent-ui/TabHeader';

// Soft, light palette: warm cream surfaces, slate-blue for structure, brass for labels.
const SOFT = '#5F6B73';     // body text
const LINE = '#E3E8EA';
const BRASS = '#9A7424';
const SLATE = '#2F5D78';
const CREAM = '#FBF8EF';
const CODE_BG = '#F2F6F8';
const CODE_LINE = '#D6E2E9';
const MONO = "'IBM Plex Mono', monospace";

function P({ children }: { children: ReactNode }) {
  return <p style={{ fontSize: '0.84rem', color: SOFT, lineHeight: 1.65, margin: '0 0 0.8rem' }}>{children}</p>;
}

function H({ children }: { children: ReactNode }) {
  return <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: SLATE, letterSpacing: '-0.01em', margin: '1.2rem 0 0.45rem' }}>{children}</h3>;
}

function Code({ children, label }: { children: string; label?: string }) {
  return (
    <div style={{ margin: '0.2rem 0 1rem' }}>
      {label && <p style={{ fontFamily: MONO, fontSize: '0.64rem', color: BRASS, letterSpacing: '0.06em', textTransform: 'uppercase', margin: '0 0 0.3rem' }}>{label}</p>}
      <pre style={{ background: CODE_BG, color: '#2B4558', border: `1px solid ${CODE_LINE}`, borderLeft: `3px solid #7FA6BD`, borderRadius: 6, padding: '0.8rem 0.95rem', margin: 0, fontFamily: MONO, fontSize: '0.74rem', lineHeight: 1.6, overflowX: 'auto' }}>
        <code>{children}</code>
      </pre>
    </div>
  );
}

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul style={{ margin: '0 0 0.9rem', paddingLeft: '1.15rem', fontSize: '0.84rem', color: SOFT, lineHeight: 1.65 }}>
      {items.map((item, i) => <li key={i} style={{ marginBottom: '0.25rem' }}>{item}</li>)}
    </ul>
  );
}

const cell: CSSProperties = { padding: '0.45rem 0.6rem', borderBottom: `1px solid ${LINE}`, fontSize: '0.78rem', color: SOFT, verticalAlign: 'top', lineHeight: 1.5 };

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div style={{ overflowX: 'auto', margin: '0.2rem 0 1rem', border: `1px solid ${LINE}`, borderRadius: 6 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 420 }}>
        <thead>
          <tr>{head.map(h => <th key={h} style={{ ...cell, textAlign: 'left', fontWeight: 600, color: '#6B5420', background: '#F6F0DE' }}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={{ ...cell, color: j === 0 ? SLATE : SOFT, fontWeight: j === 0 ? 500 : 400 }}>{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

function Mono({ children }: { children: ReactNode }) {
  return <code style={{ fontFamily: MONO, fontSize: '0.76rem', background: '#E9F0F4', padding: '0.05rem 0.3rem', borderRadius: 3, color: SLATE }}>{children}</code>;
}

// ─── sections ───────────────────────────────────────────────────────────────

function Basics() {
  return (
    <>
      <P>A custom tool is a small Python function you write once and your agent can then call by name, in chat or as a step in a task chain.</P>
      <Code label="The idea">{`inputs (typed)  →  your run() function  →  one standard result`}</Code>
      <H>How a call works</H>
      <Bullets items={[
        'The agent (or a task step) calls the tool with arguments.',
        'The platform checks and converts the arguments first. A bad value goes back to the agent as a clear error it can fix, and your code never runs.',
        'Your function runs in a fresh, isolated sandbox that is thrown away afterwards, so nothing carries over between calls.',
        'Whatever you return comes back to the agent as the tool result.',
      ]} />
      <H>What you write</H>
      <P>You declare the inputs, and the editor builds the <Mono>def run(...)</Mono> line for you. You type only the body of the function: plain code, no signature, no indentation.</P>
      <P>An optional <b>Imports &amp; helper functions</b> box above it holds module-level code (imports, helper functions) that runs before <Mono>run()</Mono>.</P>
      <H>Building one, step by step</H>
      <Bullets items={[
        <>Click <b>+ New tool</b> and give it a lowercase name (letters, numbers, underscores) and a clear description. The agent decides when to use the tool from that description.</>,
        'Add input variables. Write a specific description for each one, because the agent has no other guidance on what to pass.',
        'Write the function body and say what the tool returns (a value, a file, or both).',
        'Add secrets or extra packages if the code needs them, then press Run test.',
        'Save. A check runs first and shows you anything to fix.',
      ]} />
    </>
  );
}

function Inputs() {
  return (
    <>
      <P>Each input has a type. The platform converts to it before your code runs, so you can rely on what you receive.</P>
      <Table
        head={['Type', 'Your code gets', 'Notes']}
        rows={[
          ['Text', <Mono key="a">str</Mono>, 'Optional format check: email, URL or UUID.'],
          ['Whole number', <Mono key="a">int</Mono>, '"5" and 5.0 are accepted and converted.'],
          ['Decimal number', <Mono key="a">int / float</Mono>, ''],
          ['True / false', <Mono key="a">bool</Mono>, '"true", "yes" and similar are accepted.'],
          ['Choice', <Mono key="a">str</Mono>, 'You list the allowed options.'],
          ['Date', <Mono key="a">str</Mono>, 'Validated YYYY-MM-DD.'],
          ['Date & time', <Mono key="a">str</Mono>, 'ISO 8601, e.g. 2025-01-31T14:30:00Z.'],
          ['Time', <Mono key="a">str</Mono>, 'HH:MM or HH:MM:SS.'],
          ['List', <Mono key="a">list</Mono>, 'Pick the item type: text, whole, decimal or true/false.'],
          ['Object', <Mono key="a">dict</Mono>, 'The agent sends JSON text; you receive a real dict.'],
          ['File', <Mono key="a">str (path)</Mono>, 'A workspace file, staged for you. See Files.'],
          ['Files', <Mono key="a">list[str]</Mono>, 'Several workspace files.'],
        ]}
      />
      <H>Required, optional and defaults</H>
      <P>Every input can be required or optional. Text, number, choice and date types can also have a default. An optional input that is left out arrives as its default, or <Mono>None</Mono> if it has none. Input names must be valid Python names and unique.</P>
    </>
  );
}

function Results() {
  return (
    <>
      <P><Mono>return</Mono> any JSON-friendly value: a number, text, true/false, <Mono>None</Mono>, a list, or a dict. A dict with named keys is usually the easiest for an agent to read.</P>
      <Code label="Return a dict">{`return {"total": total, "currency": "INR", "items": len(rows)}`}</Code>
      <Bullets items={[
        'If your code raises an error, it is caught and reported to the agent as the tool error. A plain, specific message helps the agent recover.',
        <><Mono>print()</Mono> output comes back as <Mono>stdout</Mono>. It is only for debugging.</>,
        <>In <b>What this tool returns</b>, choose <i>a value</i>, <i>a file</i> or <i>a value and a file</i>, and add a one-line description. The agent and the task planner both read that line.</>,
      ]} />
      <H>The standard result</H>
      <P>Every call returns the same shape, however it is made.</P>
      <Code>{`success:  {"ok": true,  "value": <what run() returned>,
           "file": "<path>", "files": ["<path>", ...], "stdout": "..."}
failure:  {"ok": false, "error": "..."}`}</Code>
      <P>In a task chain, a later step refers to this result as <Mono>{'{"$ref": "step"}'}</Mono> for the value, or <Mono>step.file</Mono> and <Mono>step.files</Mono> for produced files.</P>
    </>
  );
}

function Files() {
  return (
    <>
      <H>Files coming in</H>
      <P>Add a <b>File</b> or <b>Files</b> input. The agent passes a workspace file (a chat upload, an earlier step&apos;s output), the platform puts it in the sandbox, and your code receives its path. You can limit the allowed extensions, for example <Mono>.xlsx</Mono>. A missing file fails the call before your code runs.</P>
      <Code>{`import pandas as pd
df = pd.read_excel(sheet)   # "sheet" is a File input`}</Code>
      <H>Fixed files (templates, helpers)</H>
      <P>For something that is the same on every run for every user, such as a template, a helper module or reference data, use <b>Attached files</b>. Workspaces are per user, so a file in your own workspace would not exist for the other people using the agent.</P>
      <H>Files going out</H>
      <P>Save anything the tool produces inside the <Mono>output/</Mono> folder. Only files there are kept; anything else is scratch.</P>
      <Code>{`df.to_excel("output/report.xlsx", index=False)
return {"rows": len(df)}`}</Code>
      <Bullets items={[
        'Saved files go to the workspace automatically, and the result carries their paths in file and files.',
        'If the tool is declared to produce a file and writes none, the call fails with a clear message.',
        'Limit: 25 MB of files in and 25 MB out per call.',
      ]} />
    </>
  );
}

function Environment() {
  return (
    <>
      <H>Where it runs</H>
      <P>Every call starts a fresh, isolated micro-VM, runs your function and shuts it down. There is no import restriction and the network is fully open (HTTP, SMTP, raw sockets, databases), with no setting to switch on.</P>
      <P>These packages are preinstalled: <Mono>numpy</Mono>, <Mono>pandas</Mono>, <Mono>requests</Mono>, <Mono>python-dateutil</Mono>, <Mono>pytz</Mono>, <Mono>PyYAML</Mono>, <Mono>beautifulsoup4</Mono>, <Mono>lxml</Mono>, <Mono>openpyxl</Mono>, <Mono>pydantic</Mono>, <Mono>jsonschema</Mono>. List anything else under <b>Extra pip packages</b>. Extras are installed on every run, which adds time.</P>
      <H>Limits per call</H>
      <Bullets items={[
        'Timeout: you set it per tool. Default 120 s, maximum 400 s. The run is stopped when it expires.',
        'Memory: 768 MB.',
        'Compute: 25 CPU-seconds. Time spent waiting on the network does not count.',
        'Files: 25 MB in and 25 MB out.',
        'Always pass a timeout to your own network calls (for example requests.get(url, timeout=20)) so a bad connection fails fast with a clear message.',
      ]} />
      <H>Secrets</H>
      <P>Under <b>Secrets this tool can use</b>, pick admin secrets and per-user keys. They arrive as environment variables, so you read them by name.</P>
      <Code>{`import os
api_key = os.environ["MY_API_KEY"]`}</Code>
      <P>Read only the names you need. Reading the whole environment at once (dict(os.environ), looping over it) is refused. Per-user keys give each connected user their own value for the same tool.</P>
    </>
  );
}

function TestAndSave() {
  return (
    <>
      <H>Run test</H>
      <P>Run test runs your unsaved draft through exactly the path a live call takes: the same sandbox, your real secrets, attached files, input checks and output handling. A passing test means a passing run.</P>
      <Bullets items={[
        'Secrets are real, so a test that sends an email really sends it.',
        'File inputs are read from your own workspace. Files the tool produces can be downloaded from the result.',
      ]} />
      <H>Saving</H>
      <P>Saving runs a check first and lists anything to fix:</P>
      <Bullets items={[
        'Name: lowercase letters, numbers and underscores; not the name of a built-in tool; unique for this agent.',
        'Input definitions, and that run() matches them.',
        'Python syntax, with line numbers.',
        'Package names.',
      ]} />
      <P>Renaming a tool that has attached files is blocked, because its files are stored under the tool&apos;s name.</P>
      <H>Making tools work well</H>
      <Bullets items={[
        'Name and describe the tool by what it does for the user, not how. The agent picks tools from the description.',
        'Describe each input with an example value, for example "Invoice date, like 2025-03-14".',
        'Keep one tool to one job. Several small tools chain better than one that does everything.',
        'Return named keys, and say in the description what they mean.',
        'Turn on "safe for planning" (Execution section) only for tools that are harmless to run for real, since the task planner may call them while designing a chain.',
      ]} />
    </>
  );
}

function Examples() {
  return (
    <>
      <P>Each example shows the inputs to declare, what the tool returns, and the function body to type.</P>

      <H>1. Number adder</H>
      <P>Inputs: <Mono>a</Mono> (whole number), <Mono>b</Mono> (whole number). Returns: a value.</P>
      <Code>{`return a + b`}</Code>
      <P>Test with a=2233, b=44323 and you get <Mono>{'{"ok": true, "value": 46556}'}</Mono>.</P>

      <H>2. Look up a live price over an API</H>
      <P>Inputs: <Mono>symbol</Mono> (text). Secret: <Mono>PRICE_API_KEY</Mono>. Returns: a value.</P>
      <Code>{`import os, requests

resp = requests.get(
    "https://api.example.com/v1/price",
    params={"symbol": symbol},
    headers={"Authorization": f"Bearer {os.environ['PRICE_API_KEY']}"},
    timeout=20,
)
if resp.status_code != 200:
    raise ValueError(f"Price API returned {resp.status_code}: {resp.text[:200]}")
data = resp.json()
return {"symbol": symbol, "price": data["price"], "as_of": data["timestamp"]}`}</Code>

      <H>3. Summarise a spreadsheet into a report file</H>
      <P>Inputs: <Mono>sheet</Mono> (file, .xlsx), <Mono>group_by</Mono> (text). Returns: a value and a file.</P>
      <Code>{`import pandas as pd

df = pd.read_excel(sheet)
if group_by not in df.columns:
    raise ValueError(f"Column '{group_by}' not found. Columns are: {list(df.columns)}")
summary = df.groupby(group_by).sum(numeric_only=True).reset_index()
summary.to_excel("output/summary.xlsx", index=False)
return {"groups": len(summary), "rows_read": len(df)}`}</Code>

      <H>4. Send an email over SMTP</H>
      <P>Inputs: <Mono>to</Mono> (text, email format), <Mono>subject</Mono> (text), <Mono>body</Mono> (text), <Mono>attachment</Mono> (file, optional). Secrets: <Mono>SMTP_USER</Mono>, <Mono>SMTP_PASSWORD</Mono>. Returns: a value.</P>
      <Code label="Imports & helper functions">{`import os, smtplib
from email.message import EmailMessage`}</Code>
      <Code label="Function body">{`msg = EmailMessage()
msg["From"] = os.environ["SMTP_USER"]
msg["To"] = to
msg["Subject"] = subject
msg.set_content(body)

if attachment:
    with open(attachment, "rb") as f:
        msg.add_attachment(f.read(), maintype="application", subtype="octet-stream",
                           filename=os.path.basename(attachment))

with smtplib.SMTP("smtp.office365.com", 587, timeout=20) as server:
    server.starttls()
    server.login(os.environ["SMTP_USER"], os.environ["SMTP_PASSWORD"])
    server.send_message(msg)
return {"sent_to": to}`}</Code>

      <H>5. Choice and list inputs</H>
      <P>Inputs: <Mono>region</Mono> (choice: north, south, east, west), <Mono>months</Mono> (list of whole numbers), <Mono>include_tax</Mono> (true/false, default false). Returns: a value.</P>
      <Code>{`rate = 1.18 if include_tax else 1.0
base = {"north": 100, "south": 90, "east": 80, "west": 95}[region]
return {"region": region, "monthly": [round(base * m * rate, 2) for m in months]}`}</Code>
    </>
  );
}

const TABS: { key: string; label: string; body: () => ReactNode }[] = [
  { key: 'basics', label: 'Overview', body: Basics },
  { key: 'inputs', label: 'Inputs', body: Inputs },
  { key: 'results', label: 'Results', body: Results },
  { key: 'files', label: 'Files', body: Files },
  { key: 'env', label: 'Runtime & secrets', body: Environment },
  { key: 'test', label: 'Test & save', body: TestAndSave },
  { key: 'examples', label: 'Examples', body: Examples },
];

// ─── modal + trigger ────────────────────────────────────────────────────────

function GuideModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState(TABS[0].key);
  const active = TABS.find(t => t.key === tab) ?? TABS[0];
  const Body = active.body;

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(10,10,10,0.35)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
    >
      <div
        role="dialog" aria-modal="true" aria-label="How to build tools"
        style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 8, width: '100%', maxWidth: 760, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}
      >
        <div style={{ padding: '1.25rem 1.5rem 0.9rem', borderBottom: `1px solid ${LINE}`, background: CREAM, borderRadius: '8px 8px 0 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
            <div>
              <p style={{ fontFamily: MONO, fontSize: '0.68rem', color: BRASS, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 0.25rem' }}>Tool Builder guide</p>
              <h2 style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: '1.35rem', fontWeight: 500, color: '#6B5420', margin: 0, letterSpacing: '-0.015em' }}>How to build tools</h2>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.4rem', lineHeight: 1, color: SOFT, padding: '0 0.2rem' }}>×</button>
          </div>
          <div role="tablist" style={{ display: 'flex', gap: '0.3rem', marginTop: '0.9rem', overflowX: 'auto' }}>
            {TABS.map(t => (
              <button
                key={t.key} type="button" role="tab" aria-selected={t.key === tab} onClick={() => setTab(t.key)}
                style={{
                  flex: 'none', border: 'none', cursor: 'pointer', padding: '0.35rem 0.75rem', borderRadius: 999, fontSize: '0.76rem', fontFamily: "'Inter', sans-serif",
                  background: t.key === tab ? '#E3EEF4' : 'transparent', color: t.key === tab ? SLATE : SOFT, fontWeight: t.key === tab ? 600 : 400,
                  outline: t.key === tab ? '1px solid #BCD3E0' : 'none',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ padding: '1.1rem 1.5rem 1.5rem', overflowY: 'auto' }}>
          <Body />
        </div>
      </div>
    </div>
  );
}

/** The "How to build tools" button plus the modal it opens. */
export function ToolGuideButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <HeaderButton variant="outline" onClick={() => setOpen(true)}>
        <Icon name="book-open" size={14} />How to build tools
      </HeaderButton>
      {open && <GuideModal onClose={() => setOpen(false)} />}
    </>
  );
}
