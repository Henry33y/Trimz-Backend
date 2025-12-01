import dotenv from 'dotenv';
// Ensure environment variables are loaded even if server entry loads dotenv too late
dotenv.config();
import Appointment from '../models/appointment.model.js';
import ProviderService from '../models/providerService.model.js';
import User from '../models/user.model.js';
import { getFrontendBase } from '../config/frontendUrl.js';
import crypto from 'crypto';

const PAYSTACK_BASE = process.env.PAYSTACK_BASE_URL || 'https://api.paystack.co';
// Support alternate env names and ensure we re-read on each access if needed.
// Keep a getter to allow hot-reload scenarios where env might be injected later.
function getPaystackSecret() {
  return process.env.PAYSTACK_SECRET_KEY || process.env.PAYSTACK_SECRET || process.env.paystack_secret_key;
}
const PAYSTACK_SECRET = getPaystackSecret();
const PAYSTACK_CURRENCY = process.env.PAYSTACK_CURRENCY || 'GHS';

function toMinorUnits(amountNumber) {
  // Paystack expects amounts in minor units:
  // NGN=kobo, GHS=pesewas, USD=cents, etc. (i.e., value * 100)
  return Math.round(Number(amountNumber) * 100);
}

export const initPaystackPayment = async (req, res) => {
  try {
    const { appointmentId } = req.body;
    if (!appointmentId) return res.status(400).json({ success: false, message: 'appointmentId is required' });
    const secret = getPaystackSecret();
    if (!secret) return res.status(500).json({ success: false, message: 'PAYSTACK_SECRET_KEY is not configured' });

    // Load appointment and ensure the requester is the customer
    const appt = await Appointment.findById(appointmentId).populate('customer', 'email name').lean();
    if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found' });
    if (!req.user || String(req.user.id) !== String(appt.customer)) {
      // When populated as object, appt.customer may be object; handle both
      const customerId = typeof appt.customer === 'object' ? appt.customer._id : appt.customer;
      if (String(req.user?.id) !== String(customerId)) {
        return res.status(403).json({ success: false, message: 'Not allowed to pay for this appointment' });
      }
    }

    // Compute amount from provider services or fallback to totalPrice
    let amount = 0;
    if (Array.isArray(appt.providerServices) && appt.providerServices.length) {
      const services = await ProviderService.find({ _id: { $in: appt.providerServices } }, 'price');
      amount = services.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
    } else if (appt.totalPrice) {
      amount = Number(appt.totalPrice) || 0;
    }

    if (!amount || amount <= 0) return res.status(400).json({ success: false, message: 'Invalid amount for appointment' });

    // Customer email
    let email = undefined;
    if (appt.customer && typeof appt.customer === 'object') {
      email = appt.customer.email;
    } else {
      const user = await User.findById(appt.customer, 'email');
      email = user?.email;
    }
    if (!email) return res.status(400).json({ success: false, message: 'Customer email is required' });

    const reference = `trimz_${appointmentId}_${Date.now()}`;
    const callbackUrlBase = getFrontendBase().replace(/\/$/, '');
    const callback_url = `${callbackUrlBase}/payment/callback`;

    const payload = {
      email,
      amount: toMinorUnits(amount),
      currency: PAYSTACK_CURRENCY,
      reference,
      callback_url
    };

    const resp = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${secret}`
      },
      body: JSON.stringify(payload)
    });

    const json = await resp.json();
    if (!resp.ok || !json?.status) {
      return res.status(502).json({ success: false, message: json?.message || 'Failed to initialize Paystack transaction' });
    }

    // Save reference on appointment
    await Appointment.findByIdAndUpdate(appointmentId, { paymentReference: reference, paymentMethod: 'card' });

    return res.status(200).json({ success: true, authorization_url: json.data.authorization_url, reference });
  } catch (err) {
    console.error('Paystack init error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const verifyPaystackPayment = async (req, res) => {
  try {
    const { reference } = req.body || {};
    if (!reference) return res.status(400).json({ success: false, message: 'reference is required' });
    const secret = getPaystackSecret();
    if (!secret) return res.status(500).json({ success: false, message: 'PAYSTACK_SECRET_KEY is not configured' });

    const resp = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { 'Authorization': `Bearer ${secret}` }
    });
    const json = await resp.json();

    if (!resp.ok || !json?.status) {
      return res.status(502).json({ success: false, message: json?.message || 'Verification failed' });
    }

    const data = json.data;
    const successful = data?.status === 'success';

    const appt = await Appointment.findOne({ paymentReference: reference });
    if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found for reference' });

    if (successful) {
      appt.paymentStatus = 'paid';
      appt.paymentMethod = 'card';
      appt.paymentPaidAt = new Date();
      await appt.save();
    }

    return res.status(200).json({ success: true, paid: successful, gateway: data?.gateway_response || data?.status, data });
  } catch (err) {
    console.error('Paystack verify error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Webhook: receives asynchronous events from Paystack
export const paystackWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-paystack-signature'];
    if (!signature) return res.status(400).send('Missing signature');

    // req.body is a raw buffer (configured in server.js before json middleware)
    const hmac = crypto
      .createHmac('sha512', getPaystackSecret())
      .update(req.body)
      .digest('hex');

    if (hmac !== signature) {
      return res.status(401).send('Invalid signature');
    }

    const payload = JSON.parse(req.body.toString('utf8'));
    if (payload?.event === 'charge.success') {
      const reference = payload?.data?.reference;
      if (reference) {
        const appt = await Appointment.findOne({ paymentReference: reference });
        if (appt && appt.paymentStatus !== 'paid') {
          appt.paymentStatus = 'paid';
          appt.paymentMethod = 'card';
          appt.paymentPaidAt = new Date();
          await appt.save();
        }
      }
    }

    return res.status(200).send('ok');
  } catch (err) {
    console.error('Paystack webhook error:', err);
    return res.status(500).send('error');
  }
};
