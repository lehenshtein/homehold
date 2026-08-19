import express from 'express';
import controller from './user.controller';
import { requireAuthentication, requireAdmin } from '../../middleware/Authentication';

const router = express.Router();

router.get('/me', requireAuthentication, controller.me);
router.post('/', requireAuthentication, requireAdmin, controller.create);

export = router;
