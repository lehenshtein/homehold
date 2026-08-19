// Route aggregator, mirroring eneri-be's pattern: each app module's router
// gets imported and re-exported here, then mounted in server.ts.
import AuthenticationRoutes from './apps/authentication/authentication.router';
import UserRoutes from './apps/user/user.router';
import NoteRoutes from './apps/note/note.router';

export { AuthenticationRoutes, UserRoutes, NoteRoutes };
