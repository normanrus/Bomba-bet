import { Router } from 'express';
import { requireAdmin, requireAuth } from '../../middleware/auth';
import auditRoutes from './audit';
import catalogRoutes from './catalog';
import eventRoutes from './events';
import prizeRoutes from './prizes';
import settingsRoutes from './settings';
import statsRoutes from './stats';
import userRoutes from './users';

const router = Router();

// Every admin route requires a valid token AND the admin role.
router.use(requireAuth, requireAdmin);

router.use('/stats', statsRoutes);
router.use('/users', userRoutes);
router.use('/events', eventRoutes);
router.use('/catalog', catalogRoutes);
router.use('/prizes', prizeRoutes);
router.use('/settings', settingsRoutes);
router.use('/audit', auditRoutes);

export default router;
