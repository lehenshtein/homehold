import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3100;

app.use(cors());
app.use(express.json());

app.get('/ping', (_req, res) => {
  res.status(200).send('ok');
});

app.listen(port, () => {
  console.log(`homehold-backend listening on port ${port}`);
});
