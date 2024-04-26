import { sendSMS, updateCustomers } from '../controllers/smppController.js';
import { Router } from 'express';

const router = Router();

router.post('/send', sendSMS);
router.post('/customers/update', updateCustomers);

export default router;
