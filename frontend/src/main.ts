import { initLanding } from './pages/landing';
import { initNotes } from './pages/notes';

// No client-side history/pushState routing — plain <a href> links do full
// page loads. nginx (prod, see nginx.conf) and Vite (dev) both fall back
// to index.html for any unmatched path, so this always gets a fresh load
// to route from. Simpler than an SPA router for a two-page app.
function route(): void {
  if (window.location.pathname.startsWith('/notes')) {
    void initNotes();
  } else {
    void initLanding();
  }
}

route();
