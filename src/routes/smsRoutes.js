import { sendSMS, receiveSMS } from '../controllers/smppController.js';
import { Router } from 'express';

const router = Router();

router.post('/send', sendSMS);
router.get('/receive', receiveSMS);

export default router;
