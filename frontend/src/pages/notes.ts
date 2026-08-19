import { fetchMe, isLoggedIn, login, guestLogin, logout, type CurrentUser } from '../auth';
import { escapeHtml, formValue, onFormSubmit, setHtml } from '../dom-utils';
import {
  listNotes, listTags, listUsers, getNote, createNote, updateNote, deleteNote,
  addItem, updateItem, deleteItem, updateSharing,
  VISIBILITY_OPTIONS,
  type NoteSummary, type NoteDetail, type NoteFilter, type NoteType, type NoteVisibility,
  type RegisteredUser, type TagCount,
} from '../notes-api';

type View =
  | { kind: 'board' }
  | { kind: 'create'; noteType: NoteType }
  | { kind: 'detail'; noteId: string };

interface SharingDraft {
  visibility: NoteVisibility;
  userIds: Set<string>;
}

interface State {
  checkingSession: boolean;
  user: CurrentUser | null;
  authPanel: null | 'login';
  filter: NoteFilter;
  search: string;
  notes: NoteSummary[] | null;
  // Unfiltered-by-search snapshot of the current filter's notes, used as the
  // source for search type-ahead suggestions. Kept separate from `notes` so
  // suggestions don't collapse to just the current results once you search.
  suggestPool: NoteSummary[];
  myTags: TagCount[];
  draftTags: string[];
  view: View;
  detail: NoteDetail | null;
  registeredUsers: RegisteredUser[] | null;
  sharingDraft: SharingDraft | null;
  busy: boolean;
  error: string | null;
  info: string | null;
}

const state: State = {
  checkingSession: isLoggedIn(),
  user: null,
  authPanel: null,
  filter: 'all',
  search: '',
  notes: null,
  suggestPool: [],
  myTags: [],
  draftTags: [],
  view: { kind: 'board' },
  detail: null,
  registeredUsers: null,
  sharingDraft: null,
  busy: false,
  error: null,
  info: null,
};

const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 24;
const CLOUD_SIZE = 5;

// Mirrors the backend's normalizeTags (note.lib.ts) so what you see locally
// is exactly what gets stored.
function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '-').slice(0, MAX_TAG_LENGTH);
}

// Deterministic pseudo-random tilt per note id, so a sticker's rotation
// stays stable across re-renders instead of jittering on every render().
function hashRotation(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return (Math.abs(hash) % 13) - 6; // -6..6 degrees
}

const VISIBILITY_ICON: Record<NoteVisibility, string> = {
  private: '🔒', public: '🌍', guests: '🕶️', users: '👥', specific: '🎯',
};

// ---------- tag editor (shared by the create form and the detail view) ----------
//
// Every piece around the <input> lives in its own container id so handlers
// can refresh them via setHtml() without touching the input — see
// dom-utils.ts setHtml for why a full render() here would break typing.

function renderTagChips(tags: string[]): string {
  if (tags.length === 0) return '<span class="tag-empty">No tags yet</span>';
  return tags.map((tag) => `
    <span class="tag-chip">
      #${escapeHtml(tag)}
      <button type="button" class="tag-chip-remove" data-tag="${escapeHtml(tag)}" title="Remove tag" aria-label="Remove tag ${escapeHtml(tag)}">✕</button>
    </span>
  `).join('');
}

// The clickable helper cloud. With an empty input it's the user's 5
// most-used tags; as they type it narrows to matches, which is the
// "keeps changing while you type the name" behaviour.
function renderTagCloud(query: string, selected: string[]): string {
  const q = normalizeTag(query);
  const candidates = state.myTags
    .filter((t) => !selected.includes(t.tag))
    .filter((t) => (q ? t.tag.includes(q) : true))
    .slice(0, CLOUD_SIZE);

  if (candidates.length === 0) {
    return q
      ? `<span class="tag-empty">Tap Add to create “${escapeHtml(normalizeTag(query))}”</span>`
      : '<span class="tag-empty">Your most-used tags will show up here</span>';
  }

  const label = q ? 'Matching:' : 'Most used:';
  return `
    <span class="tag-cloud-label">${label}</span>
    ${candidates.map((t) => `
      <button type="button" class="tag-suggestion" data-tag="${escapeHtml(t.tag)}">
        #${escapeHtml(t.tag)}<span class="tag-count">${t.count}</span>
      </button>
    `).join('')}
  `;
}

function renderTagEditor(ns: string, tags: string[]): string {
  return `
    <div class="tag-editor">
      <label class="tag-editor-label">Tags</label>
      <div class="tag-chips" id="${ns}-chips">${renderTagChips(tags)}</div>
      <div class="tag-input-row">
        <input type="text" class="tag-input" id="${ns}-input" placeholder="Add a tag…" maxlength="${MAX_TAG_LENGTH}" autocomplete="off" enterkeyhint="done" />
        <button type="button" class="btn btn-stroke btn-primary btn-sm" id="${ns}-add">Add</button>
      </div>
      <div class="tag-cloud" id="${ns}-cloud">${renderTagCloud('', tags)}</div>
    </div>
  `;
}

interface TagEditorHooks {
  getTags: () => string[];
  setTags: (tags: string[]) => void;
}

function attachTagEditorHandlers(ns: string, hooks: TagEditorHooks): void {
  const input = document.getElementById(`${ns}-input`) as HTMLInputElement | null;
  const chips = document.getElementById(`${ns}-chips`);
  if (!input || !chips) return;

  // Refreshes only the chips + cloud, never the input, so focus and caret
  // survive. Re-attaches handlers to the freshly-written markup.
  const refresh = (): void => {
    const tags = hooks.getTags();
    setHtml(`${ns}-chips`, renderTagChips(tags));
    setHtml(`${ns}-cloud`, renderTagCloud(input.value, tags));
    wireDynamicBits();
  };

  const addTag = (raw: string): void => {
    const tag = normalizeTag(raw);
    const tags = hooks.getTags();
    if (!tag || tags.includes(tag) || tags.length >= MAX_TAGS) {
      input.value = '';
      refresh();
      return;
    }
    hooks.setTags([...tags, tag]);
    input.value = '';
    refresh();
    input.focus();
  };

  const removeTag = (tag: string): void => {
    hooks.setTags(hooks.getTags().filter((t) => t !== tag));
    refresh();
  };

  function wireDynamicBits(): void {
    document.querySelectorAll<HTMLButtonElement>(`#${ns}-chips .tag-chip-remove`).forEach((btn) => {
      btn.addEventListener('click', () => removeTag(btn.dataset.tag ?? ''));
    });
    document.querySelectorAll<HTMLButtonElement>(`#${ns}-cloud .tag-suggestion`).forEach((btn) => {
      btn.addEventListener('click', () => addTag(btn.dataset.tag ?? ''));
    });
  }

  input.addEventListener('input', () => {
    // Filtering is client-side over already-fetched tags, so this is instant
    // and needs no debounce or in-flight request bookkeeping.
    setHtml(`${ns}-cloud`, renderTagCloud(input.value, hooks.getTags()));
    wireDynamicBits();
  });

  document.getElementById(`${ns}-add`)?.addEventListener('click', () => addTag(input.value));

  input.addEventListener('keydown', (e) => {
    // Desktop path. Mobile soft keyboards frequently DON'T report key==='Enter'
    // here (Android IMEs send keyCode 229), which is why the Add button above
    // exists and why the create form rescues any un-added text on submit.
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(input.value);
    } else if (e.key === 'Backspace' && input.value === '') {
      const tags = hooks.getTags();
      if (tags.length > 0) removeTag(tags[tags.length - 1]);
    }
  });

  wireDynamicBits();
}

// ---------- search type-ahead ----------

interface SearchSuggestion {
  kind: 'tag' | 'title';
  value: string;
  noteId?: string;
}

function computeSearchSuggestions(query: string): SearchSuggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const tagMatches = [...new Set(state.suggestPool.flatMap((n) => n.tags))]
    .filter((tag) => tag.includes(q))
    .slice(0, 5)
    .map((tag): SearchSuggestion => ({ kind: 'tag', value: tag }));

  const titleMatches = state.suggestPool
    .filter((n) => n.title.toLowerCase().includes(q))
    .slice(0, 5)
    .map((n): SearchSuggestion => ({ kind: 'title', value: n.title, noteId: n.id }));

  return [...tagMatches, ...titleMatches];
}

function renderSearchSuggestions(query: string): string {
  const suggestions = computeSearchSuggestions(query);
  if (suggestions.length === 0) return '';
  return suggestions.map((s) => s.kind === 'tag'
    ? `<button type="button" class="typeahead-item" data-kind="tag" data-value="${escapeHtml(s.value)}"><span class="typeahead-kind">tag</span>#${escapeHtml(s.value)}</button>`
    : `<button type="button" class="typeahead-item" data-kind="title" data-note-id="${s.noteId}"><span class="typeahead-kind">note</span>${escapeHtml(s.value)}</button>`
  ).join('');
}

// ---------- rendering ----------

function renderAuthGate(): string {
  const formOrButtons = state.authPanel === 'login'
    ? `
      <form id="notes-login-form" class="auth-form">
        <input name="username" placeholder="Username" autocomplete="username" required />
        <input name="password" type="password" placeholder="Password" autocomplete="current-password" required />
        <button type="submit" class="btn btn-fill btn-primary" ${state.busy ? 'disabled' : ''}>Log in</button>
        <button type="button" class="btn btn-text btn-neutral" id="notes-cancel-login">Cancel</button>
      </form>
    `
    : `
      <div class="auth-actions">
        <button type="button" class="btn btn-stroke btn-neutral" id="notes-guest-button" ${state.busy ? 'disabled' : ''}>Continue as guest</button>
        <button type="button" class="btn btn-fill btn-primary" id="notes-open-login">Log in</button>
      </div>
    `;

  return `
    <div class="notes-gate">
      <h1>📌 Homehold Notes</h1>
      <p>Log in to view the pinboard.</p>
      ${formOrButtons}
      ${state.error ? `<p class="auth-message auth-message-error">${escapeHtml(state.error)}</p>` : ''}
      <a href="/" class="notes-back-link">&larr; Back to Homehold</a>
    </div>
  `;
}

function renderSticker(note: NoteSummary): string {
  const rotation = hashRotation(note.id);
  return `
    <button type="button" class="sticker" data-note-id="${note.id}" style="--rotate: ${rotation}deg; background: ${note.color};">
      <span class="sticker-pin" aria-hidden="true"></span>
      <span class="sticker-type">${note.type === 'todo' ? '✅' : '📝'}</span>
      <span class="sticker-title">${escapeHtml(note.title)}</span>
      ${note.tags.length > 0 ? `<span class="sticker-tags">${note.tags.slice(0, 3).map((t) => `#${escapeHtml(t)}`).join(' ')}${note.tags.length > 3 ? ` +${note.tags.length - 3}` : ''}</span>` : ''}
      <span class="sticker-author">by ${escapeHtml(note.ownerUsername)}</span>
      ${note.isSharedByMe ? `<span class="sticker-shared" title="${escapeHtml(VISIBILITY_OPTIONS.find((o) => o.value === note.visibility)?.label ?? '')}">${VISIBILITY_ICON[note.visibility]} shared</span>` : ''}
    </button>
  `;
}

function renderBoard(): string {
  return `
    <div class="notes-toolbar">
      <div class="notes-filters">
        <button type="button" class="filter-button ${state.filter === 'all' ? 'active' : ''}" data-filter="all">All</button>
        <button type="button" class="filter-button ${state.filter === 'mine' ? 'active' : ''}" data-filter="mine">My notes</button>
        <button type="button" class="filter-button ${state.filter === 'shared' ? 'active' : ''}" data-filter="shared">Shared with me</button>
      </div>
      <div class="notes-create-actions">
        <button type="button" class="pastel-button pastel-yellow" id="create-note-button">+ Note</button>
        <button type="button" class="pastel-button pastel-blue" id="create-todo-button">+ To-do list</button>
      </div>
    </div>
    <div class="search-row">
      <div class="search-box">
        <span class="search-icon" aria-hidden="true">🔍</span>
        <input type="text" id="note-search-input" class="search-input" placeholder="Search titles and tags…" value="${escapeHtml(state.search)}" autocomplete="off" />
        <button type="button" class="btn btn-text btn-neutral btn-sm" id="clear-search"${state.search ? '' : ' hidden'}>Clear</button>
        <div class="typeahead-dropdown" id="search-suggestions"></div>
      </div>
      <span class="search-active-note" id="search-status">${state.search ? `Showing results for “${escapeHtml(state.search)}”` : ''}</span>
    </div>
    ${state.error ? `<p class="auth-message auth-message-error">${escapeHtml(state.error)}</p>` : ''}
    ${state.info ? `<p class="auth-message auth-message-info">${escapeHtml(state.info)}</p>` : ''}
    <div class="corkboard" id="corkboard">${renderCorkboardInner()}</div>
  `;
}

// Split out so live search can repaint ONLY the board via setHtml() — a full
// render() would destroy the search <input> mid-typing and drop focus.
function renderCorkboardInner(): string {
  const notesList = state.notes ?? [];
  if (state.notes === null) return '<p class="corkboard-empty">Loading…</p>';
  if (notesList.length === 0) {
    return `<p class="corkboard-empty">${state.search ? 'Nothing matches that search.' : 'No notes here yet — pin one!'}</p>`;
  }
  return notesList.map(renderSticker).join('');
}

function renderCreateForm(): string {
  const isTodo = state.view.kind === 'create' && state.view.noteType === 'todo';
  return `
    <div class="note-panel">
      <h2>${isTodo ? 'New to-do list' : 'New note'}</h2>
      <form id="create-note-form" class="note-form">
        <input name="title" placeholder="Title" required maxlength="80" />
        ${isTodo
          ? `<textarea name="items" placeholder="One item per line" rows="6"></textarea>`
          : `<textarea name="content" placeholder="Write your note…" rows="8"></textarea>`
        }
        ${renderTagEditor('create-tags', state.draftTags)}
        <div class="note-form-actions">
          <button type="submit" class="btn btn-fill btn-primary" ${state.busy ? 'disabled' : ''}>Pin it</button>
          <button type="button" class="btn btn-text btn-neutral" id="cancel-create">Cancel</button>
        </div>
      </form>
    </div>
  `;
}

function renderSharingPanel(): string {
  if (!state.detail?.isMine || !state.sharingDraft) return '';
  const draft = state.sharingDraft;

  const visibilityCards = VISIBILITY_OPTIONS.map((opt) => `
    <label class="visibility-option ${draft.visibility === opt.value ? 'selected' : ''}">
      <input type="radio" name="visibility" value="${opt.value}" ${draft.visibility === opt.value ? 'checked' : ''} />
      <span class="visibility-option-icon">${opt.icon}</span>
      <span class="visibility-option-body">
        <span class="visibility-option-label">${escapeHtml(opt.label)}</span>
        <span class="visibility-option-help">${escapeHtml(opt.help)}</span>
      </span>
    </label>
  `).join('');

  const multiselect = draft.visibility === 'specific'
    ? `
      <div class="user-multiselect">
        ${state.registeredUsers === null
          ? '<span class="user-multiselect-empty">Loading users…</span>'
          : state.registeredUsers.length === 0
            ? '<span class="user-multiselect-empty">No other registered users yet.</span>'
            : state.registeredUsers.map((u) => `
                <label class="user-checkbox">
                  <input type="checkbox" value="${u.id}" ${draft.userIds.has(u.id) ? 'checked' : ''} />
                  ${escapeHtml(u.username)}
                </label>
              `).join('')
        }
      </div>
    `
    : '';

  return `
    <div class="note-sharing">
      <h3>Sharing</h3>
      <div class="visibility-picker">${visibilityCards}</div>
      ${multiselect}
      <button type="button" class="btn btn-fill btn-primary btn-sm" id="save-sharing-button" ${state.busy ? 'disabled' : ''}>Save sharing</button>
    </div>
  `;
}

function renderDetail(): string {
  const note = state.detail;
  if (!note) {
    return `<div class="note-panel"><p>Loading…</p></div>`;
  }
  const isOwner = note.isMine;

  const body = note.type === 'todo'
    ? `
      <ul class="todo-items">
        ${note.items.map((item) => `
          <li class="todo-item" data-item-id="${item.id}">
            <input type="checkbox" class="todo-item-checkbox" ${item.done ? 'checked' : ''} ${isOwner ? '' : 'disabled'} />
            ${isOwner
              ? `<input type="text" class="todo-item-text" value="${escapeHtml(item.text)}" maxlength="300" />`
              : `<span class="todo-item-text-readonly ${item.done ? 'done' : ''}">${escapeHtml(item.text)}</span>`
            }
            ${isOwner ? `<button type="button" class="btn btn-text btn-danger btn-icon btn-sm todo-item-delete" title="Delete item">✕</button>` : ''}
          </li>
        `).join('')}
      </ul>
      ${isOwner ? `
        <form id="add-item-form" class="note-form inline-form">
          <input name="text" placeholder="Add item…" maxlength="300" required />
          <button type="submit" class="btn btn-fill btn-primary btn-sm">Add</button>
        </form>
      ` : ''}
    `
    : (isOwner
      ? `
        <textarea id="note-content-textarea" rows="10" maxlength="5000">${escapeHtml(note.content || '')}</textarea>
        <button type="button" class="btn btn-fill btn-primary btn-sm" id="save-content-button">Save</button>
      `
      : `<p class="note-content-readonly">${escapeHtml(note.content || '') || '<em>Empty note</em>'}</p>`
    );

  return `
    <div class="note-panel note-detail" style="--note-color: ${note.color};">
      <div class="note-detail-header">
        ${isOwner
          ? `<input id="note-title-input" class="note-title-input" value="${escapeHtml(note.title)}" maxlength="80" />`
          : `<h2>${escapeHtml(note.title)}</h2>`
        }
        <span class="note-detail-author">by ${escapeHtml(note.ownerUsername)}</span>
      </div>

      ${body}

      ${isOwner
        ? renderTagEditor('detail-tags', note.tags)
        : (note.tags.length > 0
            ? `<div class="tag-chips readonly">${note.tags.map((t) => `<span class="tag-chip">#${escapeHtml(t)}</span>`).join('')}</div>`
            : '')
      }

      ${renderSharingPanel()}

      ${state.error ? `<p class="auth-message auth-message-error">${escapeHtml(state.error)}</p>` : ''}
      ${state.info ? `<p class="auth-message auth-message-info">${escapeHtml(state.info)}</p>` : ''}

      <div class="note-detail-actions">
        <button type="button" class="btn btn-stroke btn-neutral" id="close-detail">Close</button>
        ${isOwner ? `<button type="button" class="btn btn-fill btn-danger" id="delete-note-button">Delete</button>` : ''}
      </div>
    </div>
  `;
}

function renderUnsafe(): void {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) return;

  if (state.checkingSession) {
    app.innerHTML = `<div class="notes-gate"><p>Checking session…</p></div>`;
    return;
  }

  if (!state.user) {
    app.innerHTML = renderAuthGate();
    attachGateHandlers();
    return;
  }

  const header = `
    <header class="notes-header">
      <a href="/" class="notes-back-link">&larr; Homehold</a>
      <h1>📌 Notes</h1>
      <div class="auth-actions">
        <span class="auth-status">Signed in as <strong>${escapeHtml(state.user.username)}</strong>${state.user.isGuest ? ' (guest)' : ''}</span>
        <button type="button" class="btn btn-text btn-danger" id="notes-logout-button">Log out</button>
      </div>
    </header>
  `;

  let body = '';
  if (state.view.kind === 'board') body = renderBoard();
  else if (state.view.kind === 'create') body = renderCreateForm();
  else if (state.view.kind === 'detail') body = renderDetail();

  app.innerHTML = `<div class="notes-page">${header}${body}</div>`;
  attachBoardHandlers();
}

// render() is called from several fire-and-forget async callbacks (e.g.
// listUsers().then(...) in openNote) that have no surrounding try/catch of
// their own. If renderUnsafe() throws there, it becomes a silent unhandled
// promise rejection — the DOM just never updates again, looking like an
// infinite "Loading…" hang with no visible error at all. This wrapper
// guarantees render() itself never throws: on failure it logs to the
// console AND paints a visible fallback into #app, so a bug here is loud
// instead of silent.
function render(): void {
  try {
    renderUnsafe();
  } catch (err) {
    console.error('[notes] render() failed:', err);
    const app = document.querySelector<HTMLDivElement>('#app');
    if (app) {
      const message = err instanceof Error ? err.message : String(err);
      app.innerHTML = `
        <div class="notes-page">
          <p class="auth-message auth-message-error">Something broke rendering this page: ${escapeHtml(message)}. Check the browser console for details, or <a href="/notes">reload</a>.</p>
        </div>
      `;
    }
  }
}

// ---------- action helpers ----------

// Same rule as landing.ts/dom-utils.ts: render() rebuilds the DOM, so
// anything read from it must be captured before calling this, not inside
// `action`.
async function withBusy(action: () => Promise<void>): Promise<void> {
  state.busy = true;
  state.error = null;
  render();
  try {
    await action();
  } catch (err) {
    state.error = err instanceof Error ? err.message : 'Something went wrong';
  } finally {
    state.busy = false;
    render();
  }
}

async function loadNotes(): Promise<void> {
  state.notes = await listNotes(state.filter, state.search);
  // Only an unsearched load is a valid suggestion pool — otherwise typing
  // would progressively narrow the very list the suggestions come from.
  if (!state.search) state.suggestPool = state.notes;
}

async function refreshMyTags(): Promise<void> {
  try {
    state.myTags = await listTags();
  } catch {
    state.myTags = []; // helper cloud degrades to empty; tagging still works
  }
}

// Guards against a genuine network-level hang (not a throw — those are
// already caught) leaving the "Specific people" picker on "Loading users…"
// forever with no way to know something's wrong.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Timed out loading users')), ms)),
  ]);
}

async function openNote(noteId: string): Promise<void> {
  state.view = { kind: 'detail', noteId };
  state.detail = null;
  state.registeredUsers = null;
  state.sharingDraft = null;
  state.error = null;
  state.info = null;
  render();
  try {
    const note = await getNote(noteId);
    state.detail = note;
    primeSharingState(note);
  } catch (err) {
    state.error = err instanceof Error ? err.message : 'Could not open note';
    state.view = { kind: 'board' };
  } finally {
    render();
  }
}

// Sets up everything the sharing panel needs for a note you own: the local
// draft, plus the registered-user list the "Specific people" multiselect
// renders from.
//
// MUST be called on EVERY path that lands on the detail view — opening an
// existing note AND creating a new one. `state.registeredUsers === null` is
// what renders "Loading users…", so a path that sets up the detail view
// without calling this leaves the picker hanging on that message forever,
// with no request in flight and no error to show. That was a real bug: the
// create-note handler set the detail view up by hand and skipped the fetch,
// so sharing appeared broken on every freshly-pinned note but worked fine
// after closing and reopening it.
function primeSharingState(note: NoteDetail): void {
  if (!note.isMine) return;

  state.sharingDraft = {
    visibility: note.visibility,
    userIds: new Set((note.sharedWith ?? []).map((u) => u.id)),
  };
  state.registeredUsers = null;

  withTimeout(listUsers(), 8000).then((users) => {
    state.registeredUsers = users;
    render();
  }).catch((err) => {
    state.registeredUsers = [];
    state.error = `Could not load the user list for sharing: ${err instanceof Error ? err.message : 'unknown error'}`;
    render();
  });
}

function backToBoard(): void {
  state.view = { kind: 'board' };
  state.detail = null;
  state.registeredUsers = null;
  state.sharingDraft = null;
  state.error = null;
  state.info = null;
  render();
  void withBusy(loadNotes);
}

// ---------- event wiring ----------

function attachGateHandlers(): void {
  document.getElementById('notes-open-login')?.addEventListener('click', () => {
    state.authPanel = 'login';
    state.error = null;
    render();
  });

  document.getElementById('notes-cancel-login')?.addEventListener('click', () => {
    state.authPanel = null;
    state.error = null;
    render();
  });

  document.getElementById('notes-guest-button')?.addEventListener('click', () => {
    void withBusy(async () => {
      await guestLogin();
      state.user = await fetchMe();
      await Promise.all([loadNotes(), refreshMyTags()]);
    });
  });

  onFormSubmit('notes-login-form', (form) => {
    void withBusy(async () => {
      await login(formValue(form, 'username'), formValue(form, 'password'));
      state.user = await fetchMe();
      state.authPanel = null;
      await Promise.all([loadNotes(), refreshMyTags()]);
    });
  });
}

// Sticker click handlers, re-bound whenever the board's markup is replaced
// (full render OR the surgical live-search repaint).
function wireStickerClicks(): void {
  document.querySelectorAll<HTMLButtonElement>('.sticker').forEach((sticker) => {
    sticker.addEventListener('click', () => {
      const noteId = sticker.dataset.noteId;
      if (noteId) void openNote(noteId);
    });
  });
}

function attachBoardHandlers(): void {
  document.getElementById('notes-logout-button')?.addEventListener('click', () => {
    logout();
    state.user = null;
    state.notes = null;
    state.view = { kind: 'board' };
    render();
  });

  // --- board view ---
  document.querySelectorAll<HTMLButtonElement>('.filter-button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const filter = btn.dataset.filter as NoteFilter;
      state.filter = filter;
      void withBusy(loadNotes);
    });
  });

  document.getElementById('create-note-button')?.addEventListener('click', () => {
    state.view = { kind: 'create', noteType: 'note' };
    state.draftTags = [];
    state.error = null;
    render();
  });

  document.getElementById('create-todo-button')?.addEventListener('click', () => {
    state.view = { kind: 'create', noteType: 'todo' };
    state.draftTags = [];
    state.error = null;
    render();
  });

  wireStickerClicks();

  // --- search box ---
  const searchInput = document.getElementById('note-search-input') as HTMLInputElement | null;
  if (searchInput) {
    // Repaints ONLY the board + status text, leaving the search input (and
    // its focus/caret) untouched. Used by live search; a full render() here
    // would kill typing mid-word — same constraint as the tag editor.
    const refreshBoardOnly = async (): Promise<void> => {
      try {
        await loadNotes();
      } catch (err) {
        state.error = err instanceof Error ? err.message : 'Search failed';
      }
      setHtml('corkboard', renderCorkboardInner());
      const status = document.getElementById('search-status');
      if (status) status.textContent = state.search ? `Showing results for \u201C${state.search}\u201D` : '';
      document.getElementById('clear-search')?.toggleAttribute('hidden', !state.search);
      wireStickerClicks();
    };

    let searchTimer: ReturnType<typeof setTimeout> | undefined;
    const commitSearch = (value: string, immediate = true): void => {
      state.search = value;
      setHtml('search-suggestions', '');
      if (searchTimer) clearTimeout(searchTimer);
      if (immediate) {
        void refreshBoardOnly();
      } else {
        // Debounced live search: no Enter required, which matters because
        // mobile soft keyboards don't reliably fire keydown Enter at all.
        searchTimer = setTimeout(() => void refreshBoardOnly(), 400);
      }
    };

    const wireSuggestionClicks = (): void => {
      document.querySelectorAll<HTMLButtonElement>('#search-suggestions .typeahead-item').forEach((item) => {
        item.addEventListener('click', () => {
          if (item.dataset.kind === 'tag') {
            commitSearch(item.dataset.value ?? '');
          } else if (item.dataset.noteId) {
            setHtml('search-suggestions', '');
            void openNote(item.dataset.noteId);
          }
        });
      });
    };

    // Suggestions come from already-loaded notes, so this is instant and
    // needs no debounce. Only the dropdown is rewritten — never the input,
    // which would drop focus mid-typing.
    searchInput.addEventListener('input', () => {
      setHtml('search-suggestions', renderSearchSuggestions(searchInput.value));
      wireSuggestionClicks();
      commitSearch(searchInput.value, false);
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitSearch(searchInput.value);
      } else if (e.key === 'Escape') {
        setHtml('search-suggestions', '');
      }
    });

    document.getElementById('clear-search')?.addEventListener('click', () => commitSearch(''));
  }

  // --- create view ---
  document.getElementById('cancel-create')?.addEventListener('click', () => {
    state.view = { kind: 'board' };
    state.error = null;
    render();
  });

  if (state.view.kind === 'create') {
    attachTagEditorHandlers('create-tags', {
      getTags: () => state.draftTags,
      setTags: (tags) => { state.draftTags = tags; },
    });
  }

  onFormSubmit('create-note-form', (form) => {
    if (state.view.kind !== 'create') return;
    const noteType = state.view.noteType;
    const title = formValue(form, 'title');
    const content = noteType === 'note' ? formValue(form, 'content') : undefined;
    const items = noteType === 'todo'
      ? formValue(form, 'items').split('\n').map((s) => s.trim()).filter(Boolean)
      : undefined;

    // Rescue a tag that was typed but never committed: on mobile the soft
    // keyboard's Go/Done key can submit the form before the tag is added, so
    // anything still sitting in the input would otherwise be silently lost.
    const pendingTag = normalizeTag(
      (document.getElementById('create-tags-input') as HTMLInputElement | null)?.value ?? ''
    );
    const tags = [...state.draftTags];
    if (pendingTag && !tags.includes(pendingTag) && tags.length < MAX_TAGS) tags.push(pendingTag);

    void withBusy(async () => {
      const created = await createNote({ type: noteType, title, content, items, tags });
      state.detail = created;
      state.view = { kind: 'detail', noteId: created.id };
      state.draftTags = [];
      state.info = 'Pinned!';
      // Same setup an existing note gets from openNote() — including the
      // user-list fetch the sharing multiselect needs. See primeSharingState.
      primeSharingState(created);
      await refreshMyTags();
    });
  });

  // --- detail view ---
  document.getElementById('close-detail')?.addEventListener('click', backToBoard);

  if (state.view.kind === 'detail' && state.detail?.isMine) {
    attachTagEditorHandlers('detail-tags', {
      getTags: () => state.detail?.tags ?? [],
      // Optimistic: update local state so the chips/cloud repaint instantly,
      // then persist. On failure the error banner shows and the next open
      // re-reads the server's truth.
      setTags: (tags) => {
        if (!state.detail) return;
        const noteId = state.detail.id;
        state.detail = { ...state.detail, tags };
        updateNote(noteId, { tags })
          .then((updated) => {
            state.detail = updated;
            void refreshMyTags();
          })
          .catch((err) => {
            state.error = err instanceof Error ? err.message : 'Could not save tags';
            render();
          });
      },
    });
  }

  document.getElementById('delete-note-button')?.addEventListener('click', () => {
    if (!state.detail) return;
    const noteId = state.detail.id;
    if (!window.confirm('Delete this note? This cannot be undone.')) return;
    void withBusy(async () => {
      await deleteNote(noteId);
      state.view = { kind: 'board' };
      state.detail = null;
      state.info = 'Note deleted.';
      await loadNotes();
    });
  });

  const titleInput = document.getElementById('note-title-input') as HTMLInputElement | null;
  titleInput?.addEventListener('change', () => {
    if (!state.detail) return;
    const noteId = state.detail.id;
    const title = titleInput.value;
    void withBusy(async () => {
      state.detail = await updateNote(noteId, { title });
    });
  });

  document.getElementById('save-content-button')?.addEventListener('click', () => {
    if (!state.detail) return;
    const noteId = state.detail.id;
    const textarea = document.getElementById('note-content-textarea') as HTMLTextAreaElement | null;
    const content = textarea?.value ?? '';
    void withBusy(async () => {
      state.detail = await updateNote(noteId, { content });
      state.info = 'Saved.';
    });
  });

  onFormSubmit('add-item-form', (form) => {
    if (!state.detail) return;
    const noteId = state.detail.id;
    const text = formValue(form, 'text');
    void withBusy(async () => {
      state.detail = await addItem(noteId, text);
    });
  });

  document.querySelectorAll<HTMLLIElement>('.todo-item').forEach((li) => {
    const itemId = li.dataset.itemId;
    if (!itemId || !state.detail) return;
    const noteId = state.detail.id;

    li.querySelector<HTMLInputElement>('.todo-item-checkbox')?.addEventListener('change', (e) => {
      const done = (e.target as HTMLInputElement).checked;
      void withBusy(async () => {
        state.detail = await updateItem(noteId, itemId, { done });
      });
    });

    li.querySelector<HTMLInputElement>('.todo-item-text')?.addEventListener('change', (e) => {
      const text = (e.target as HTMLInputElement).value;
      void withBusy(async () => {
        state.detail = await updateItem(noteId, itemId, { text });
      });
    });

    li.querySelector<HTMLButtonElement>('.todo-item-delete')?.addEventListener('click', () => {
      void withBusy(async () => {
        state.detail = await deleteItem(noteId, itemId);
      });
    });
  });

  // --- sharing panel ---
  document.querySelectorAll<HTMLInputElement>('.visibility-option input[type="radio"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      if (!state.sharingDraft) return;
      state.sharingDraft.visibility = (e.target as HTMLInputElement).value as NoteVisibility;
      render();
    });
  });

  document.querySelectorAll<HTMLInputElement>('.user-checkbox input[type="checkbox"]').forEach((checkbox) => {
    checkbox.addEventListener('change', (e) => {
      if (!state.sharingDraft) return;
      const target = e.target as HTMLInputElement;
      if (target.checked) state.sharingDraft.userIds.add(target.value);
      else state.sharingDraft.userIds.delete(target.value);
      render();
    });
  });

  document.getElementById('save-sharing-button')?.addEventListener('click', () => {
    if (!state.detail || !state.sharingDraft) return;
    const noteId = state.detail.id;
    const { visibility, userIds } = state.sharingDraft;
    void withBusy(async () => {
      state.detail = await updateSharing(noteId, { visibility, userIds: [...userIds] });
      state.info = 'Sharing updated.';
    });
  });
}

export async function initNotes(): Promise<void> {
  render();

  if (state.checkingSession) {
    try {
      state.user = await fetchMe();
    } catch {
      logout();
      state.user = null;
    } finally {
      state.checkingSession = false;
    }
  }

  if (state.user) {
    await withBusy(async () => {
      await Promise.all([loadNotes(), refreshMyTags()]);
    });
  } else {
    render();
  }
}
