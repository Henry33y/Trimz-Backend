import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { initPaystackPayment, verifyPaystackPayment, paystackWebhook, paystackDiag } from '../controllers/payment.controller.js';

const paymentRouter = Router();

// Initialize a Paystack transaction for a given appointment
paymentRouter.post('/init', requireAuth, initPaystackPayment);

// Verify a Paystack payment by reference
paymentRouter.post('/verify', requireAuth, verifyPaystackPayment);

export default paymentRouter;

// Safe diagnostics (no secret leak)
paymentRouter.get('/diag', (req, res) => paystackDiag(req, res));
