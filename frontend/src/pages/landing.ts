import eneriLogo from '../assets/images/logo/eneri-logo.png';
import { login, guestLogin, logout, changePassword, createUser, fetchMe, isLoggedIn, type CurrentUser } from '../auth';
import { escapeHtml, formValue, onFormSubmit } from '../dom-utils';

interface PetProject {
  name: string;
  description: string;
  url: string;
  icon: string;
  internal?: boolean; // internal route (e.g. /notes) vs. external site — affects link target
}

// Static registry for now. Once the backend has a project table, fetch this
// from the API instead of hardcoding it here (see CLAUDE.md roadmap).
const projects: PetProject[] = [
  {
    name: 'Eneri',
    description: 'TTRPG platform for finding players and games',
    url: 'https://eneri.com.ua',
    icon: eneriLogo,
  },
];

type Panel = null | 'login' | 'change-password' | 'create-user';

interface AppState {
  user: CurrentUser | null;
  checkingSession: boolean;
  panel: Panel;
  error: string | null;
  info: string | null;
  busy: boolean;
}

const state: AppState = {
  user: null,
  checkingSession: isLoggedIn(),
  panel: null,
  error: null,
  info: null,
  busy: false,
};

function renderProjectCard(project: PetProject): string {
  const targetAttrs = project.internal ? '' : ' target="_blank" rel="noopener"';
  return `
    <a class="project-card" href="${project.url}"${targetAttrs}>
      <img class="icon" src="${project.icon}" alt="${project.name} logo" />
      <div class="name">${project.name}</div>
      <div class="description">${project.description}</div>
    </a>
  `;
}

function renderNotesCard(): string {
  return `
    <a class="project-card" href="/notes">
      <span class="icon icon-emoji" aria-hidden="true">📌</span>
      <div class="name">Notes</div>
      <div class="description">Shared pinboard — notes &amp; to-do lists</div>
    </a>
  `;
}

function renderPlaceholderCard(): string {
  return `
    <div class="project-card placeholder">
      <div class="icon icon-placeholder" aria-hidden="true">+</div>
      <div class="name">More coming soon</div>
      <div class="description">Future pet projects will show up here</div>
    </div>
  `;
}

function renderAuthArea(): string {
  if (state.checkingSession) {
    return `<div class="auth-actions"><span class="auth-status">Checking session…</span></div>`;
  }

  if (!state.user) {
    if (state.panel === 'login') {
      return `
        <form id="login-form" class="auth-form">
          <input name="username" placeholder="Username" autocomplete="username" required />
          <input name="password" type="password" placeholder="Password" autocomplete="current-password" required />
          <button type="submit" class="btn btn-fill btn-primary" ${state.busy ? 'disabled' : ''}>Log in</button>
          <button type="button" class="btn btn-text btn-neutral" id="cancel-panel">Cancel</button>
        </form>
      `;
    }
    return `
      <div class="auth-actions">
        <button type="button" class="btn btn-stroke btn-neutral" id="guest-login-button" ${state.busy ? 'disabled' : ''}>Continue as guest</button>
        <button type="button" class="btn btn-fill btn-primary" id="open-login">Log in</button>
      </div>
    `;
  }

  const parts: string[] = [
    `
    <div class="auth-actions">
      <a href="/notes" class="notes-nav-link">📌 Notes</a>
      <span class="auth-status">Signed in as <strong>${escapeHtml(state.user.username)}</strong>${state.user.isGuest ? ' (guest)' : ''} (${escapeHtml(state.user.role)})</span>
      <button type="button" class="btn btn-stroke btn-neutral" id="toggle-change-password">Change password</button>
      ${state.user.role === 'admin' ? '<button type="button" class="btn btn-stroke btn-neutral" id="toggle-create-user">Create account</button>' : ''}
      <button type="button" class="btn btn-text btn-danger" id="logout-button">Log out</button>
    </div>
    `,
  ];

  if (state.panel === 'change-password') {
    parts.push(`
      <form id="change-password-form" class="auth-form">
        <input name="currentPassword" type="password" placeholder="Current password" autocomplete="current-password" required />
        <input name="newPassword" type="password" placeholder="New password" autocomplete="new-password" required minlength="4" />
        <button type="submit" class="btn btn-fill btn-primary" ${state.busy ? 'disabled' : ''}>Update password</button>
        <button type="button" class="btn btn-text btn-neutral" id="cancel-panel">Cancel</button>
      </form>
    `);
  }

  if (state.panel === 'create-user' && state.user.role === 'admin') {
    parts.push(`
      <form id="create-user-form" class="auth-form">
        <input name="username" placeholder="New username" autocomplete="off" required />
        <input name="password" type="password" placeholder="Temporary password" autocomplete="new-password" required minlength="4" />
        <button type="submit" class="btn btn-fill btn-primary" ${state.busy ? 'disabled' : ''}>Create account</button>
        <button type="button" class="btn btn-text btn-neutral" id="cancel-panel">Cancel</button>
      </form>
    `);
  }

  return parts.join('');
}

function renderUnsafe(): void {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) return;

  app.innerHTML = `
    <div class="page">
      <header class="hero">
        <h1>Homehold</h1>
        ${renderAuthArea()}
      </header>

      ${state.error ? `<p class="auth-message auth-message-error">${escapeHtml(state.error)}</p>` : ''}
      ${state.info ? `<p class="auth-message auth-message-info">${escapeHtml(state.info)}</p>` : ''}

      <h2 class="section-title">Projects</h2>
      <div class="project-grid">
        ${projects.map(renderProjectCard).join('')}
        ${renderNotesCard()}
        ${renderPlaceholderCard()}
      </div>

      <footer>Homehold &mdash; hub for pet projects.</footer>
    </div>
  `;

  attachHandlers();
}

// render() is called from fire-and-forget contexts with no surrounding
// try/catch of their own — see notes.ts's identical wrapper for the full
// rationale (a throw inside renderUnsafe() would otherwise be a silent
// unhandled rejection: the DOM just stops updating, no visible error).
function render(): void {
  try {
    renderUnsafe();
  } catch (err) {
    console.error('[landing] render() failed:', err);
    const app = document.querySelector<HTMLDivElement>('#app');
    if (app) {
      const message = err instanceof Error ? err.message : String(err);
      app.innerHTML = `<div class="page"><p class="auth-message auth-message-error">Something broke rendering this page: ${escapeHtml(message)}. Check the browser console for details, or <a href="/">reload</a>.</p></div>`;
    }
  }
}

// See dom-utils.ts: re-render (inside here) rebuilds the whole #app
// subtree, including a fresh <form> — so anything `action` needs from a
// submitted form must already be captured before this runs, never looked
// up from the DOM inside `action` itself.
async function withBusy(action: () => Promise<void>): Promise<void> {
  state.busy = true;
  state.error = null;
  state.info = null;
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

function attachHandlers(): void {
  document.getElementById('open-login')?.addEventListener('click', () => {
    state.panel = 'login';
    state.error = null;
    render();
  });

  document.getElementById('cancel-panel')?.addEventListener('click', () => {
    state.panel = null;
    state.error = null;
    state.info = null;
    render();
  });

  document.getElementById('logout-button')?.addEventListener('click', () => {
    logout();
    state.user = null;
    state.panel = null;
    state.info = 'Logged out.';
    render();
  });

  document.getElementById('toggle-change-password')?.addEventListener('click', () => {
    state.panel = state.panel === 'change-password' ? null : 'change-password';
    state.error = null;
    state.info = null;
    render();
  });

  document.getElementById('toggle-create-user')?.addEventListener('click', () => {
    state.panel = state.panel === 'create-user' ? null : 'create-user';
    state.error = null;
    state.info = null;
    render();
  });

  document.getElementById('guest-login-button')?.addEventListener('click', () => {
    void withBusy(async () => {
      await guestLogin();
      state.user = await fetchMe();
      state.info = 'Logged in as guest.';
    });
  });

  onFormSubmit('login-form', (form) => {
    void withBusy(async () => {
      await login(formValue(form, 'username'), formValue(form, 'password'));
      state.user = await fetchMe();
      state.panel = null;
      state.info = 'Logged in.';
    });
  });

  onFormSubmit('change-password-form', (form) => {
    void withBusy(async () => {
      await changePassword(formValue(form, 'currentPassword'), formValue(form, 'newPassword'));
      state.panel = null;
      state.info = 'Password updated.';
    });
  });

  onFormSubmit('create-user-form', (form) => {
    void withBusy(async () => {
      const username = formValue(form, 'username');
      await createUser(username, formValue(form, 'password'));
      state.panel = null;
      state.info = `Account "${username}" created.`;
    });
  });
}

export async function initLanding(): Promise<void> {
  render();

  if (state.checkingSession) {
    try {
      state.user = await fetchMe();
    } catch {
      logout();
      state.user = null;
    } finally {
      state.checkingSession = false;
      render();
    }
  }
}
