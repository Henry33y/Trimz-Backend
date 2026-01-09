import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { initPaystackPayment, verifyPaystackPayment, paystackWebhook, paystackDiag, updatePayoutSettings, deletePayoutSettings } from '../controllers/payment.controller.js';

const paymentRouter = Router();

// Initialize a Paystack transaction for a given appointment
paymentRouter.post('/init', requireAuth, initPaystackPayment);

// Verify a Paystack payment by reference (Public as reference is a secure token)
paymentRouter.post('/verify', verifyPaystackPayment);

// Update provider payout settings
paymentRouter.put('/settings', requireAuth, updatePayoutSettings);
paymentRouter.delete('/settings', requireAuth, deletePayoutSettings);

export default paymentRouter;

// Safe diagnostics (no secret leak)
paymentRouter.get('/diag', (req, res) => paystackDiag(req, res));
