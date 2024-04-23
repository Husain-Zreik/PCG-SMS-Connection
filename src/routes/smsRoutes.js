import { sendSMS } from '../controllers/smppController.js';
import { Router } from 'express';

const router = Router();

router.post('/send', sendSMS);

export default router;
