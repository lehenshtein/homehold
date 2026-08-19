import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { addUserToRequest } from './middleware/Authentication';
import { AuthenticationRoutes, UserRoutes, NoteRoutes } from './routes';

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 6101;

app.use(cors());
app.use(express.json());
app.use(addUserToRequest);

app.get('/ping', (_req, res) => {
  res.status(200).send('ok');
});

app.use('/auth', AuthenticationRoutes);
app.use('/user', UserRoutes);
app.use('/note', NoteRoutes);

app.listen(port, () => {
  console.log(`homehold-backend listening on port ${port}`);
});
