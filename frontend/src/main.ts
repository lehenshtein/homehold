import eneriLogo from './assets/images/logo/eneri-logo.png';

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

function render(): void {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) return;

  app.innerHTML = `
    <div class="page">
      <header class="hero">
        <h1>Homehold</h1>
        <div class="auth-actions">
          <button type="button" disabled title="Coming soon">Continue as guest</button>
          <button type="button" data-variant="primary" disabled title="Coming soon">Log in</button>
        </div>
      </header>

      <h2 class="section-title">Projects</h2>
      <div class="project-grid">
        ${projects.map(renderProjectCard).join('')}
        ${renderPlaceholderCard()}
      </div>

      <footer>Homehold &mdash; hub for pet projects.</footer>
    </div>
  `;
}

render();
