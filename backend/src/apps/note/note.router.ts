import express from 'express';
import controller from './note.controller';
import { requireAuthentication } from '../../middleware/Authentication';

const router = express.Router();

// Every note route requires being logged in (regular user or guest) —
// there's no public/anonymous read access.
router.use(requireAuthentication);

router.get('/', controller.list);
router.post('/', controller.create);
router.get('/:id', controller.read);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);
router.post('/:id/items', controller.addItem);
router.put('/:id/items/:itemId', controller.updateItem);
router.delete('/:id/items/:itemId', controller.deleteItem);
router.put('/:id/sharing', controller.updateSharing);

export = router;
