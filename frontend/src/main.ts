import eneriLogo from './assets/images/logo/eneri-logo.png';
import { login, logout, changePassword, createUser, fetchMe, isLoggedIn, type CurrentUser } from './auth';

interface PetProject {
  name: string;
  description: string;
  url: string;
  icon: string;
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

function escapeHtml(value: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return value.replace(/[&<>"']/g, (c) => map[c]);
}

function renderProjectCard(project: PetProject): string {
  return `
    <a class="project-card" href="${project.url}" target="_blank" rel="noopener">
      <img class="icon" src="${project.icon}" alt="${project.name} logo" />
      <div class="name">${project.name}</div>
      <div class="description">${project.description}</div>
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
          <button type="submit" data-variant="primary" ${state.busy ? 'disabled' : ''}>Log in</button>
          <button type="button" id="cancel-panel">Cancel</button>
        </form>
      `;
    }
    return `
      <div class="auth-actions">
        <button type="button" disabled title="Coming soon">Continue as guest</button>
        <button type="button" data-variant="primary" id="open-login">Log in</button>
      </div>
    `;
  }

  const parts: string[] = [
    `
    <div class="auth-actions">
      <span class="auth-status">Signed in as <strong>${escapeHtml(state.user.username)}</strong> (${escapeHtml(state.user.role)})</span>
      <button type="button" id="toggle-change-password">Change password</button>
      ${state.user.role === 'admin' ? '<button type="button" id="toggle-create-user">Create account</button>' : ''}
      <button type="button" id="logout-button">Log out</button>
    </div>
    `,
  ];

  if (state.panel === 'change-password') {
    parts.push(`
      <form id="change-password-form" class="auth-form">
        <input name="currentPassword" type="password" placeholder="Current password" autocomplete="current-password" required />
        <input name="newPassword" type="password" placeholder="New password" autocomplete="new-password" required minlength="4" />
        <button type="submit" data-variant="primary" ${state.busy ? 'disabled' : ''}>Update password</button>
        <button type="button" id="cancel-panel">Cancel</button>
      </form>
    `);
  }

  if (state.panel === 'create-user' && state.user.role === 'admin') {
    parts.push(`
      <form id="create-user-form" class="auth-form">
        <input name="username" placeholder="New username" autocomplete="off" required />
        <input name="password" type="password" placeholder="Temporary password" autocomplete="new-password" required minlength="4" />
        <button type="submit" data-variant="primary" ${state.busy ? 'disabled' : ''}>Create account</button>
        <button type="button" id="cancel-panel">Cancel</button>
      </form>
    `);
  }

  return parts.join('');
}

function render(): void {
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
        ${renderPlaceholderCard()}
      </div>

      <footer>Homehold &mdash; hub for pet projects.</footer>
    </div>
  `;

  attachHandlers();
}

function withBusy(action: () => Promise<void>): (e: Event) => void {
  return async (e: Event) => {
    e.preventDefault();
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
  };
}

function formValue(form: HTMLFormElement, field: string): string {
  return String(new FormData(form).get(field) || '');
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

  document.getElementById('login-form')?.addEventListener(
    'submit',
    withBusy(async () => {
      const form = document.getElementById('login-form') as HTMLFormElement;
      await login(formValue(form, 'username'), formValue(form, 'password'));
      state.user = await fetchMe();
      state.panel = null;
      state.info = 'Logged in.';
    })
  );

  document.getElementById('change-password-form')?.addEventListener(
    'submit',
    withBusy(async () => {
      const form = document.getElementById('change-password-form') as HTMLFormElement;
      await changePassword(formValue(form, 'currentPassword'), formValue(form, 'newPassword'));
      state.panel = null;
      state.info = 'Password updated.';
    })
  );

  document.getElementById('create-user-form')?.addEventListener(
    'submit',
    withBusy(async () => {
      const form = document.getElementById('create-user-form') as HTMLFormElement;
      const username = formValue(form, 'username');
      await createUser(username, formValue(form, 'password'));
      state.panel = null;
      state.info = `Account "${username}" created.`;
    })
  );
}

async function init(): Promise<void> {
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

init();
