import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Run against an already-running app: BASE_URL=http://127.0.0.1:5173 node tests/api.integration.mjs
// No browser or dependencies are required. Each run creates an isolated board and removes its cards.
const base = new URL(process.env.BASE_URL || 'http://127.0.0.1:5173');
const origin = base.origin;
const created = new Map();
let checks = 0;

function browser() {
  let cookie = '';
  return {
    get cookie() { return cookie; },
    async request(path, { method = 'GET', body, rawBody, requestOrigin = origin } = {}) {
      const headers = { Accept: 'application/json' };
      if (cookie) headers.Cookie = cookie;
      if (method !== 'GET') headers.Origin = requestOrigin;
      if (body !== undefined || rawBody !== undefined) headers['Content-Type'] = 'application/json';
      const response = await fetch(new URL(path, base), {
        method,
        headers,
        body: rawBody !== undefined ? rawBody : body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15_000),
        redirect: 'error',
      });
      const setCookies = typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : [response.headers.get('set-cookie') || ''];
      const boardCookie = setCookies.find(value => value.startsWith('kanban_board='));
      if (boardCookie) cookie = boardCookie.split(';')[0];
      const text = await response.text();
      let data;
      try { data = text ? JSON.parse(text) : undefined; } catch { data = text; }
      return { response, data, text, boardCookie };
    },
  };
}

function expectStatus(result, expected, context) {
  assert.equal(result.response.status, expected, `${context}: ${result.response.status} ${result.text}`);
  checks++;
}

function expectCard(card) {
  assert.ok(card && typeof card === 'object');
  assert.equal(typeof card.id, 'string');
  assert.ok(card.id.length > 0);
  assert.equal(typeof card.title, 'string');
  assert.equal(typeof card.description, 'string');
  assert.ok(['todo', 'doing', 'done'].includes(card.status));
  assert.ok(['low', 'medium', 'high'].includes(card.priority));
  assert.ok(Number.isFinite(Date.parse(card.created_at)), 'created_at is a timestamp');
  assert.ok(Number.isFinite(Date.parse(card.updated_at)), 'updated_at is a timestamp');
  checks++;
}

async function list(client) {
  const result = await client.request('/api/cards');
  expectStatus(result, 200, 'List cards');
  assert.ok(Array.isArray(result.data?.cards), 'GET /api/cards returns { cards: [] }');
  return result.data.cards;
}

async function create(client, body) {
  const result = await client.request('/api/cards', { method: 'POST', body });
  if (result.data?.card?.id) created.set(result.data.card.id, client);
  expectStatus(result, 201, 'Create card');
  expectCard(result.data.card);
  return result.data.card;
}

async function run() {
  const owner = browser();
  const stranger = browser();
  const initial = await owner.request('/api/cards');
  expectStatus(initial, 200, 'Initialize board');
  assert.ok(Array.isArray(initial.data?.cards));
  assert.match(initial.boardCookie || '', /^kanban_board=[^;]+;/, 'Initial GET issues board cookie');
  assert.match(initial.boardCookie, /;\s*HttpOnly(?:;|$)/i, 'Board cookie is HttpOnly');
  await list(stranger);
  assert.ok(stranger.cookie, 'Second browser gets its own board cookie');
  assert.notEqual(owner.cookie, stranger.cookie, 'Browser boards are distinct');
  checks++;

  const runId = randomUUID();
  const card = await create(owner, { title: `  Integration ${runId}  ` });
  assert.equal(card.title, `Integration ${runId}`, 'Title is trimmed');
  assert.equal(card.description, '');
  assert.equal(card.status, 'todo');
  assert.equal(card.priority, 'medium');
  assert.deepEqual((await list(owner)).find(item => item.id === card.id), card, 'Card persists across reload/list');

  let latest = card;
  for (const status of ['doing', 'done', 'todo']) {
    const moved = await owner.request(`/api/cards/${encodeURIComponent(card.id)}`, {
      method: 'PATCH', body: { status },
    });
    expectStatus(moved, 200, `Move card to ${status}`);
    expectCard(moved.data.card);
    assert.equal(moved.data.card.id, card.id);
    assert.equal(moved.data.card.status, status);
    assert.equal(moved.data.card.created_at, card.created_at);
    assert.ok(Date.parse(moved.data.card.updated_at) >= Date.parse(latest.updated_at));
    assert.equal((await list(owner)).find(item => item.id === card.id)?.status, status);
    latest = moved.data.card;
  }

  const edits = { title: '  Edited integration card  ', description: 'Persistent description\nSecond line', priority: 'high' };
  const edited = await owner.request(`/api/cards/${encodeURIComponent(card.id)}`, { method: 'PATCH', body: edits });
  expectStatus(edited, 200, 'Edit card');
  assert.equal(edited.data.card.title, edits.title.trim());
  assert.equal(edited.data.card.description, edits.description);
  assert.equal(edited.data.card.priority, 'high');
  assert.equal(edited.data.card.status, 'todo');
  assert.deepEqual((await list(owner)).find(item => item.id === card.id), edited.data.card);

  const boundary = await create(owner, {
    title: 'T'.repeat(160), description: 'D'.repeat(2000), status: 'done', priority: 'low',
  });
  assert.equal(boundary.title.length, 160);
  assert.equal(boundary.description.length, 2000);
  assert.equal(boundary.status, 'done');
  assert.equal(boundary.priority, 'low');

  const invalidCreateBodies = [
    {}, { title: '' }, { title: ' \n\t ' }, { title: 42 },
    { title: 'T'.repeat(161) }, { title: 'Invalid description', description: 'D'.repeat(2001) },
    { title: 'Invalid description type', description: 42 },
    { title: 'Invalid status', status: 'pending' },
    { title: 'Invalid priority', priority: 'urgent' },
    null, [],
  ];
  for (const body of invalidCreateBodies) {
    const result = await owner.request('/api/cards', { method: 'POST', body });
    // Track unexpected successful writes too, so a failed run still cleans up.
    if (result.data?.card?.id) created.set(result.data.card.id, owner);
    expectStatus(result, 400, `Reject invalid create: ${JSON.stringify(body)?.slice(0, 80)}`);
  }
  const invalidPatchBodies = [
    { title: '' }, { title: '  ' }, { title: 42 }, { title: 'T'.repeat(161) },
    { description: 'D'.repeat(2001) }, { description: 42 },
    { status: 'pending' }, { priority: 'urgent' }, null, [],
  ];
  for (const body of invalidPatchBodies) {
    expectStatus(await owner.request(`/api/cards/${encodeURIComponent(card.id)}`, { method: 'PATCH', body }),
      400, `Reject invalid edit: ${JSON.stringify(body)?.slice(0, 80)}`);
  }
  for (const [method, path] of [['POST', '/api/cards'], ['PATCH', `/api/cards/${encodeURIComponent(card.id)}`]]) {
    expectStatus(await owner.request(path, { method, rawBody: '{"title":' }), 400, `Reject malformed ${method} JSON`);
  }
  assert.deepEqual((await list(owner)).find(item => item.id === card.id), edited.data.card,
    'Rejected edits do not change persisted data');

  const missingId = randomUUID();
  expectStatus(await owner.request(`/api/cards/${missingId}`, { method: 'PATCH', body: { status: 'done' } }), 404, 'Unknown edit');
  expectStatus(await owner.request(`/api/cards/${missingId}`, { method: 'DELETE' }), 404, 'Unknown deletion');

  assert.ok(!(await list(stranger)).some(item => item.id === card.id || item.id === boundary.id),
    'Another browser cannot read this board');
  expectStatus(await stranger.request(`/api/cards/${encodeURIComponent(card.id)}`, {
    method: 'PATCH', body: { title: 'Unauthorized edit' },
  }), 404, 'Other board cannot edit card');
  expectStatus(await stranger.request(`/api/cards/${encodeURIComponent(card.id)}`, { method: 'DELETE' }),
    404, 'Other board cannot delete card');

  for (const [method, path, body] of [
    ['POST', '/api/cards', { title: 'Cross-origin card' }],
    ['PATCH', `/api/cards/${encodeURIComponent(card.id)}`, { status: 'done' }],
    ['DELETE', `/api/cards/${encodeURIComponent(card.id)}`, undefined],
  ]) {
    const result = await owner.request(path, { method, body, requestOrigin: 'https://untrusted.example' });
    if (method === 'POST' && result.data?.card?.id) created.set(result.data.card.id, owner);
    expectStatus(result, 403, `Reject cross-origin ${method}`);
  }
  assert.deepEqual((await list(owner)).find(item => item.id === card.id), edited.data.card,
    'Foreign board and cross-origin attempts leave the card intact');

  const deleted = await owner.request(`/api/cards/${encodeURIComponent(card.id)}`, { method: 'DELETE' });
  expectStatus(deleted, 204, 'Delete card');
  assert.equal(deleted.text, '', '204 response is empty');
  created.delete(card.id);
  assert.ok(!(await list(owner)).some(item => item.id === card.id), 'Deleted card stays absent after reload');
  expectStatus(await owner.request(`/api/cards/${encodeURIComponent(card.id)}`, { method: 'DELETE' }), 404, 'Already deleted card');
  console.log(`PASS: ${checks} API assertions at ${origin}; CRUD, validation, persistence, board isolation, and origin checks.`);
}

let failed = false;
try {
  await run();
} catch (error) {
  failed = true;
  console.error(error);
} finally {
  for (const [id, client] of created) {
    try {
      const result = await client.request(`/api/cards/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (![204, 404].includes(result.response.status)) throw new Error(`${result.response.status}: ${result.text}`);
    } catch (error) {
      failed = true;
      console.error(`Cleanup failed for card ${id}:`, error);
    }
  }
}
if (failed) process.exitCode = 1;
