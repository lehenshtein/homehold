import express from 'express';
import controller from './authentication.controller';
import { requireAuthentication } from '../../middleware/Authentication';

const router = express.Router();

router.post('/login', controller.login);
router.post('/guest', controller.guestLogin);
router.post('/change-password', requireAuthentication, controller.changePassword);

export = router;
