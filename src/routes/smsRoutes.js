import { Router } from 'express';
import { sendSMS, receiveSMS } from '../controllers/smsController';

const router = Router();

// Define routes
router.post('/send', sendSMS);
router.get('/receive', receiveSMS);

export default router;
