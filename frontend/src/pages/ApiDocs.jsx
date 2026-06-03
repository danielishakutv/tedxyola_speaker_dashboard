import { useState, useEffect } from 'react';
import { Copy, Check, Filter, Globe, List, FileText, Lock } from 'lucide-react';
import './ApiDocs.css';

// The deployed origin (e.g. https://speaker.tedxyola.com). Used so every copied
// snippet contains the real, working base URL — not a hardcoded localhost.
const ORIGIN = window.location.origin;

/* ── Reusable copy button ─────────────────────────────────── */
const CopyButton = ({ text, label = 'Copy' }) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for non-secure contexts
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button type="button" className={`ad-copy-btn ${copied ? 'copied' : ''}`} onClick={copy}>
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? 'Copied' : label}
    </button>
  );
};

/* ── Code block with title + copy ─────────────────────────── */
const CodeBlock = ({ title, code }) => (
  <div className="ad-code">
    <div className="ad-code-head">
      <span className="ad-code-title">{title}</span>
      <CopyButton text={code} />
    </div>
    <pre className="ad-code-body"><code>{code}</code></pre>
  </div>
);

/* ── Inline value + copy (e.g. base URL) ──────────────────── */
const CopyField = ({ value }) => (
  <div className="ad-field">
    <code className="ad-field-code">{value}</code>
    <CopyButton text={value} label="Copy" />
  </div>
);

/* ── Endpoint card header ─────────────────────────────────── */
const EndpointHead = ({ path }) => (
  <div className="ad-ep-head">
    <span className="ad-method">GET</span>
    <code className="ad-ep-path">{path}</code>
    <CopyButton text={`${ORIGIN}${path}`} label="Copy URL" />
  </div>
);

const QUERY_PARAMS = [
  ['q',       'string', 'Full-text search across name, talk title, company, role, and bio', '?q=climate'],
  ['company', 'string', 'Filter by company name (partial match)',                          '?company=Google'],
  ['sort',    'string', 'newest (default), oldest, or name',                               '?sort=name'],
  ['limit',   'number', 'Max results to return (1–100)',                                   '?limit=12'],
  ['offset',  'number', 'Number of results to skip, for pagination',                       '?offset=12'],
];

const RESPONSE_FIELDS = [
  ['id',          'string',        'Unique speaker ID (UUID)'],
  ['name',        'string',        'Speaker’s full name'],
  ['jobTitle',    'string | null', 'Role / title'],
  ['company',     'string | null', 'Organization'],
  ['talkTitle',   'string',        'Title of the talk'],
  ['description', 'string | null', 'Short tagline for the talk'],
  ['bio',         'string | null', 'Longer biography'],
  ['imageUrl',    'string | null', 'Headshot URL (Cloudinary, or a placeholder)'],
  ['socialLinks', 'string | null', 'JSON string — array of { platform, url }. Parse with JSON.parse()'],
  ['createdAt',   'string',        'ISO 8601 timestamp'],
];

const ApiDocs = () => {
  const [preview, setPreview] = useState({ state: 'loading', data: null });

  useEffect(() => {
    fetch(`${ORIGIN}/api/public/speakers?limit=3`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => setPreview({ state: 'ok', data: d }))
      .catch(() => setPreview({ state: 'error', data: null }));
  }, []);

  const fetchSnippet =
`// Fetch LIVE speakers from the TEDxYola API (no auth required)
async function getSpeakers(params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = "${ORIGIN}/api/public/speakers" + (qs ? "?" + qs : "");
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to load speakers");
  return res.json();
}

// Examples
const all       = await getSpeakers();
const search    = await getSpeakers({ q: "design" });
const byCompany = await getSpeakers({ company: "Google", sort: "name" });
const firstPage = await getSpeakers({ limit: 12, offset: 0 });

// socialLinks is a JSON string — parse it before use
all.forEach(s => {
  const links = s.socialLinks ? JSON.parse(s.socialLinks) : [];
  // links = [{ platform: "Twitter", url: "https://..." }, ...]
});`;

  const responseExample =
`[
  {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "Jane Doe",
    "jobTitle": "Design Lead",
    "company": "Acme Inc.",
    "talkTitle": "Designing for Impact",
    "description": "A short tagline for the talk.",
    "bio": "Jane is a designer and speaker focused on...",
    "imageUrl": "https://res.cloudinary.com/.../jane.jpg",
    "socialLinks": "[{\\"platform\\":\\"Twitter\\",\\"url\\":\\"https://x.com/jane\\"}]",
    "createdAt": "2026-05-21T18:00:00.000Z"
  }
]`;

  return (
    <div className="ad-page">
      <div className="ad-header">
        <h2>API Documentation</h2>
        <p className="ad-subtitle">
          Public, read-only endpoints for embedding TEDxYola speakers on any website.
        </p>
      </div>

      {/* ── Overview / base URL ──────────────────────────── */}
      <section className="ad-card card">
        <div className="ad-card-head">
          <div className="ad-card-icon"><Globe size={16} /></div>
          <div>
            <h3>Base URL</h3>
            <p>All public endpoints are relative to this origin.</p>
          </div>
        </div>
        <CopyField value={ORIGIN} />
        <div className="ad-notes">
          <span className="ad-note"><Lock size={12} /> No authentication required</span>
          <span className="ad-note"><Check size={12} /> CORS open — call from any domain</span>
          <span className="ad-note"><Check size={12} /> Only <strong>LIVE</strong> speakers are returned</span>
        </div>
      </section>

      {/* ── List endpoint ────────────────────────────────── */}
      <section className="ad-card card">
        <div className="ad-card-head">
          <div className="ad-card-icon"><List size={16} /></div>
          <div>
            <h3>List speakers</h3>
            <p>Returns an array of LIVE speakers. Supports the filters below.</p>
          </div>
        </div>

        <EndpointHead path="/api/public/speakers" />

        <h4 className="ad-h4"><Filter size={13} /> Query parameters</h4>
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead>
              <tr><th>Param</th><th>Type</th><th>Description</th><th>Example</th></tr>
            </thead>
            <tbody>
              {QUERY_PARAMS.map(([name, type, desc, ex]) => (
                <tr key={name}>
                  <td><code className="ad-inline">{name}</code></td>
                  <td className="ad-type">{type}</td>
                  <td>{desc}</td>
                  <td><code className="ad-inline">{ex}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <CodeBlock
          title="Example — search + sort + limit"
          code={`${ORIGIN}/api/public/speakers?q=design&sort=newest&limit=12`}
        />
      </section>

      {/* ── Single endpoint ──────────────────────────────── */}
      <section className="ad-card card">
        <div className="ad-card-head">
          <div className="ad-card-icon"><FileText size={16} /></div>
          <div>
            <h3>Get one speaker</h3>
            <p>Returns a single LIVE speaker by ID (404 if not found or not LIVE).</p>
          </div>
        </div>
        <EndpointHead path="/api/public/speakers/:id" />
      </section>

      {/* ── Response structure ───────────────────────────── */}
      <section className="ad-card card">
        <div className="ad-card-head">
          <div className="ad-card-icon"><FileText size={16} /></div>
          <div>
            <h3>Response structure</h3>
            <p>Each speaker object contains these fields.</p>
          </div>
        </div>

        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead>
              <tr><th>Field</th><th>Type</th><th>Description</th></tr>
            </thead>
            <tbody>
              {RESPONSE_FIELDS.map(([name, type, desc]) => (
                <tr key={name}>
                  <td><code className="ad-inline">{name}</code></td>
                  <td className="ad-type">{type}</td>
                  <td>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <CodeBlock title="Example response" code={responseExample} />
      </section>

      {/* ── Ready-to-use snippet ─────────────────────────── */}
      <section className="ad-card card">
        <div className="ad-card-head">
          <div className="ad-card-icon"><Copy size={16} /></div>
          <div>
            <h3>Copy-paste fetch helper</h3>
            <p>Drop this into your public website to load and filter speakers.</p>
          </div>
        </div>
        <CodeBlock title="JavaScript" code={fetchSnippet} />
      </section>

      {/* ── Live preview ─────────────────────────────────── */}
      <section className="ad-card card">
        <div className="ad-card-head">
          <div className="ad-card-icon"><Globe size={16} /></div>
          <div>
            <h3>Live response preview</h3>
            <p>Actual data returned right now from <code className="ad-inline">?limit=3</code>.</p>
          </div>
        </div>

        {preview.state === 'loading' && <div className="ad-muted">Loading live data…</div>}
        {preview.state === 'error' && <div className="ad-muted">Couldn’t reach the API.</div>}
        {preview.state === 'ok' && (
          preview.data.length === 0
            ? <div className="ad-muted">No LIVE speakers yet — mark a speaker as LIVE to see real data here.</div>
            : <CodeBlock
                title={`${preview.data.length} speaker(s) returned`}
                code={JSON.stringify(preview.data, null, 2)}
              />
        )}
      </section>

      {/* ══════════════════════════════════════════════════ */}
      {/* SPONSORS API DOCUMENTATION                         */}
      {/* ══════════════════════════════════════════════════ */}

      <section className="ad-card card" style={{ marginTop: '2rem' }}>
        <div className="ad-card-head">
          <div className="ad-card-icon" style={{ background: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}>
            <List size={16} />
          </div>
          <div>
            <h3>Sponsors Endpoints</h3>
            <p>Manage and retrieve sponsor information for your event.</p>
          </div>
        </div>

        <h4 className="ad-h4">Public Endpoints (No Authentication)</h4>

        <div className="ad-endpoint-list">
          <div className="ad-endpoint-item">
            <div className="ad-ep-head">
              <span className="ad-method">GET</span>
              <code className="ad-ep-path">/api/public/sponsors</code>
            </div>
            <p className="ad-endpoint-desc">Retrieve all LIVE sponsors — for use on the public website</p>
            <small className="ad-note">Query: q (search name/description), sort (newest/oldest/name), limit (1–100), offset</small>
          </div>

          <div className="ad-endpoint-item">
            <div className="ad-ep-head">
              <span className="ad-method">GET</span>
              <code className="ad-ep-path">/api/public/sponsors/:id</code>
            </div>
            <p className="ad-endpoint-desc">Retrieve a single LIVE sponsor by ID (404 if not found or not LIVE)</p>
          </div>
        </div>

        <h4 className="ad-h4">Protected Endpoints (Authentication Required)</h4>
        
        <div className="ad-endpoint-list">
          <div className="ad-endpoint-item">
            <div className="ad-ep-head">
              <span className="ad-method">GET</span>
              <code className="ad-ep-path">/api/sponsors</code>
            </div>
            <p className="ad-endpoint-desc">Retrieve all sponsors (admin only)</p>
          </div>

          <div className="ad-endpoint-item">
            <div className="ad-ep-head">
              <span className="ad-method">GET</span>
              <code className="ad-ep-path">/api/sponsors/:id</code>
            </div>
            <p className="ad-endpoint-desc">Retrieve a single sponsor by ID (admin only)</p>
          </div>

          <div className="ad-endpoint-item">
            <div className="ad-ep-head">
              <span className="ad-method post">POST</span>
              <code className="ad-ep-path">/api/sponsors</code>
            </div>
            <p className="ad-endpoint-desc">Create a new sponsor (admin only)</p>
            <small className="ad-note">Body: name (required), description, website, imageUrl or image file, status (DRAFT/LIVE)</small>
          </div>

          <div className="ad-endpoint-item">
            <div className="ad-ep-head">
              <span className="ad-method put">PUT</span>
              <code className="ad-ep-path">/api/sponsors/:id</code>
            </div>
            <p className="ad-endpoint-desc">Update an existing sponsor (admin only)</p>
          </div>

          <div className="ad-endpoint-item">
            <div className="ad-ep-head">
              <span className="ad-method delete">DELETE</span>
              <code className="ad-ep-path">/api/sponsors/:id</code>
            </div>
            <p className="ad-endpoint-desc">Delete a sponsor (admin only)</p>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════ */}
      {/* BLOG API DOCUMENTATION                             */}
      {/* ══════════════════════════════════════════════════ */}

      <section className="ad-card card" style={{ marginTop: '2rem' }}>
        <div className="ad-card-head">
          <div className="ad-card-icon" style={{ background: 'rgba(168,85,247,0.12)', color: '#a855f7' }}>
            <FileText size={16} />
          </div>
          <div>
            <h3>Blog Endpoints</h3>
            <p>Create and manage blog posts for your event.</p>
          </div>
        </div>

        <h4 className="ad-h4">Protected Endpoints (Authentication Required)</h4>
        
        <div className="ad-endpoint-list">
          <div className="ad-endpoint-item">
            <div className="ad-ep-head">
              <span className="ad-method">GET</span>
              <code className="ad-ep-path">/api/blogs</code>
            </div>
            <p className="ad-endpoint-desc">Retrieve all blog posts (admin only)</p>
          </div>

          <div className="ad-endpoint-item">
            <div className="ad-ep-head">
              <span className="ad-method">GET</span>
              <code className="ad-ep-path">/api/blogs/:id</code>
            </div>
            <p className="ad-endpoint-desc">Retrieve a single blog post by ID (admin only)</p>
          </div>

          <div className="ad-endpoint-item">
            <div className="ad-ep-head">
              <span className="ad-method post">POST</span>
              <code className="ad-ep-path">/api/blogs</code>
            </div>
            <p className="ad-endpoint-desc">Create a new blog post (admin only)</p>
            <small className="ad-note">Body: title (required), content (required), category (required), author (required), publishDate, status (DRAFT/LIVE)</small>
          </div>

          <div className="ad-endpoint-item">
            <div className="ad-ep-head">
              <span className="ad-method put">PUT</span>
              <code className="ad-ep-path">/api/blogs/:id</code>
            </div>
            <p className="ad-endpoint-desc">Update an existing blog post (admin only)</p>
          </div>

          <div className="ad-endpoint-item">
            <div className="ad-ep-head">
              <span className="ad-method delete">DELETE</span>
              <code className="ad-ep-path">/api/blogs/:id</code>
            </div>
            <p className="ad-endpoint-desc">Delete a blog post (admin only)</p>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════ */}
      {/* ACTIVITY LOGS                                      */}
      {/* ══════════════════════════════════════════════════ */}

      <section className="ad-card card" style={{ marginTop: '2rem' }}>
        <div className="ad-card-head">
          <div className="ad-card-icon" style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>
            <List size={16} />
          </div>
          <div>
            <h3>Activity Logs</h3>
            <p>All create, update, and delete operations are automatically logged with user information.</p>
          </div>
        </div>

        <div className="ad-notes">
          <span className="ad-note"><Check size={12} /> CREATE_SPONSOR / UPDATE_SPONSOR / DELETE_SPONSOR</span>
          <span className="ad-note"><Check size={12} /> CREATE_BLOG / UPDATE_BLOG / DELETE_BLOG</span>
          <span className="ad-note"><Check size={12} /> Logs include timestamp, user, and affected resource details</span>
        </div>
      </section>
    </div>
  );
};

export default ApiDocs;
