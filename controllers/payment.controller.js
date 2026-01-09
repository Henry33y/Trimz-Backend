import dotenv from 'dotenv';
import fetch from 'node-fetch';
// Ensure environment variables are loaded even if server entry loads dotenv too late
dotenv.config();
import Appointment from '../models/appointment.model.js';
import ProviderService from '../models/providerService.model.js';
import User from '../models/user.model.js';
import { getFrontendBase } from '../config/frontendUrl.js';
import crypto from 'crypto';
import { resolvePaystackSecret } from '../config/paystack.config.js';
import Config from '../models/config.model.js';

const PAYSTACK_BASE = process.env.PAYSTACK_BASE_URL || 'https://api.paystack.co';
const PAYSTACK_CURRENCY = process.env.PAYSTACK_CURRENCY || 'GHS';

function getPaystackSecretInfo() {
  const info = resolvePaystackSecret() || {};
  if (!info.secret) {
    return { secret: null, source: info.source || 'unresolved', envKeys: info.envKeys || [] };
  }
  return info;
}

function getPaystackSecret() {
  return getPaystackSecretInfo().secret;
}

function toMinorUnits(amountNumber) {
  // Paystack expects amounts in minor units:
  // NGN=kobo, GHS=pesewas, USD=cents, etc. (i.e., value * 100)
  return Math.round(Number(amountNumber) * 100);
}

export const initPaystackPayment = async (req, res) => {
  try {
    console.log('Secret Key at init payment: ', process.env.PAYSTACK_SECRET_KEY)
    const { appointmentId } = req.body;
    if (!appointmentId) return res.status(400).json({ success: false, message: 'appointmentId is required' });
    const { secret, source, envKeys } = getPaystackSecretInfo();
    if (!secret) {
      console.error('[Paystack][init] Missing PAYSTACK secret. Env keys tried: PAYSTACK_SECRET_KEY | PAYSTACK_SECRET | paystack_secret_key');
      return res.status(500).json({ success: false, message: 'PAYSTACK_SECRET_KEY is not configured' });
    }
    console.log('[Paystack][init] Using Paystack secret from', source, envKeys?.length ? `env keys detected: ${envKeys.join(', ')}` : 'no paystack env keys');

    // Load appointment and ensure the requester is the customer
    const appt = await Appointment.findById(appointmentId).populate('customer', 'email name').populate('provider').lean();
    if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found' });
    if (!req.user || String(req.user.id) !== String(appt.customer)) {
      const customerId = typeof appt.customer === 'object' ? appt.customer._id : appt.customer;
      if (String(req.user?.id) !== String(customerId)) {
        return res.status(403).json({ success: false, message: 'Not allowed to pay for this appointment' });
      }
    }

    // 1. Get Commission Rates from Config
    const customerFeeConfig = await Config.findOne({ key: 'customer_fee_percent' });
    const providerFeeConfig = await Config.findOne({ key: 'provider_fee_percent' });

    const customerRate = customerFeeConfig ? Number(customerFeeConfig.value) : 5; // Default 5%
    const providerRate = providerFeeConfig ? Number(providerFeeConfig.value) : 5; // Default 5%

    // 2. Compute amount from provider services or fallback to totalPrice
    let serviceAmount = 0;
    if (Array.isArray(appt.providerServices) && appt.providerServices.length) {
      const services = await ProviderService.find({ _id: { $in: appt.providerServices } }, 'price');
      serviceAmount = services.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
    } else if (appt.totalPrice) {
      serviceAmount = Number(appt.totalPrice) || 0;
    }

    if (!serviceAmount || serviceAmount <= 0) {
      console.error('[Paystack][init] Invalid amount computed', { appointmentId, serviceAmount });
      return res.status(400).json({ success: false, message: 'Invalid amount for appointment' });
    }

    // 3. Calculate the "Comfort Split"
    const customerFee = serviceAmount * (customerRate / 100);
    const providerCut = serviceAmount * (providerRate / 100);

    const totalToPay = serviceAmount + customerFee; // What the customer sees at checkout
    const platformTotal = customerFee + providerCut; // Total Trimz revenue

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

    // 4. Build Split Payload
    const provider = appt.provider;
    const payload = {
      email,
      amount: toMinorUnits(totalToPay),
      currency: PAYSTACK_CURRENCY,
      reference,
      callback_url,
      metadata: {
        appointmentId,
        service_price: serviceAmount,
        customer_fee: customerFee,
        provider_commission: providerCut,
        total_platform_revenue: platformTotal
      }
    };

    if (provider && provider.paystackSubaccountCode) {
      payload.subaccount = provider.paystackSubaccountCode;
      // transaction_charge is the part Trimz keeps
      payload.transaction_charge = toMinorUnits(platformTotal);
      console.log(`[Paystack][Split] Total: ${totalToPay}. Trimz Cut: ${platformTotal}. Barber Gets: ${totalToPay - platformTotal}`);
    }

    const initUrl = `${PAYSTACK_BASE}/transaction/initialize`;
    const resp = await fetch(initUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${secret}`
      },
      body: JSON.stringify(payload)
    });

    const json = await resp.json();
    if (!resp.ok || !json?.status) {
      console.error('[Paystack][init] Initialize failed', { status: resp.status, body: json });
      return res.status(502).json({ success: false, message: json?.message || 'Failed to initialize Paystack transaction' });
    }

    // Save reference on appointment
    await Appointment.findByIdAndUpdate(appointmentId, { paymentReference: reference, paymentMethod: 'card' });

    return res.status(200).json({ success: true, authorization_url: json.data.authorization_url, reference });
  } catch (err) {
    console.error('[Paystack][init] Unexpected error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const verifyPaystackPayment = async (req, res) => {
  try {
    const { reference } = req.body || {};
    if (!reference) return res.status(400).json({ success: false, message: 'reference is required' });
    const { secret, source, envKeys } = getPaystackSecretInfo();
    if (!secret) {
      console.error('[Paystack][verify] Missing PAYSTACK secret. Env keys tried: PAYSTACK_SECRET_KEY | PAYSTACK_SECRET | paystack_secret_key');
      return res.status(500).json({ success: false, message: 'PAYSTACK_SECRET_KEY is not configured' });
    }
    console.log('[Paystack][verify] Using Paystack secret from', source, envKeys?.length ? `env keys detected: ${envKeys.join(', ')}` : 'no paystack env keys');

    const verifyUrl = `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`;
    const resp = await fetch(verifyUrl, {
      headers: { 'Authorization': `Bearer ${secret}` }
    });
    const json = await resp.json();

    if (!resp.ok || !json?.status) {
      console.error('[Paystack][verify] Verification failed', { status: resp.status, statusText: resp.statusText, body: json });
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
    console.error('[Paystack][verify] Unexpected error:', err);
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
      console.error('[Paystack][webhook] Invalid signature');
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
    console.error('[Paystack][webhook] Unexpected error:', err);
    return res.status(500).send('error');
  }
};

// Diagnostic endpoint to verify Paystack env/config presence (no secrets leaked)
export const paystackDiag = async (req, res) => {
  try {
    const secret = getPaystackSecret();
    const hasSecret = Boolean(secret && secret.length > 10);
    const flags = {
      has_PAYSTACK_SECRET_KEY: Boolean(process.env.PAYSTACK_SECRET_KEY),
      has_PAYSTACK_SECRET: Boolean(process.env.PAYSTACK_SECRET),
      has_paystack_secret_key: Boolean(process.env.paystack_secret_key),
    };
    const envKeys = Object.keys(process.env || {}).filter((key) => key.toLowerCase().includes('paystack'));
    console.log('[Paystack][diag] env flags', {
      ...flags,
      sample: secret ? `${secret.slice(0, 6)}***` : null
    });
    return res.status(200).json({
      success: true,
      paystackBaseUrl: process.env.PAYSTACK_SECRET_KEY,
      hasSecret,
      baseUrl: PAYSTACK_BASE,
      currency: PAYSTACK_CURRENCY,
      nodeEnv: process.env.NODE_ENV || 'unknown',
      flags,
      envKeys
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// --- NEW PAYOUT SETTINGS FOR PROVIDERS ---

export const updatePayoutSettings = async (req, res) => {
  try {
    const { bankCode, accountNumber, accountName } = req.body;
    const userId = req.user.id;

    if (!bankCode || !accountNumber) {
      return res.status(400).json({ success: false, message: "Bank and Account Number are required" });
    }

    const { secret } = getPaystackSecretInfo();

    // 1. Create/Update a Subaccount on Paystack for this barber
    const response = await fetch(`${PAYSTACK_BASE}/subaccount`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secret}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        business_name: accountName || req.user.name,
        settlement_bank: bankCode,
        account_number: accountNumber,
        percentage_charge: 0
      })
    });

    const json = await response.json();

    if (!response.ok || !json.status) {
      return res.status(400).json({ success: false, message: json.message || "Failed to create Paystack subaccount" });
    }

    // 2. Save the subaccount code to our database
    const subaccountCode = json.data.subaccount_code;
    await User.findByIdAndUpdate(userId, {
      paystackSubaccountCode: subaccountCode,
      paystackBankCode: bankCode,
      paystackAccountNumber: accountNumber
    });

    res.status(200).json({
      success: true,
      message: "Payout settings updated successfully!",
      subaccountCode
    });

  } catch (error) {
    console.error("Payout update error:", error);
    res.status(500).json({ success: false, message: "Server error updating payout settings" });
  }
};

export const deletePayoutSettings = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user.paystackSubaccountCode) {
      return res.status(400).json({ success: false, message: "No payout settings found" });
    }

    const { secret } = getPaystackSecretInfo();

    // 1. Deactivate Subaccount on Paystack
    try {
      await fetch(`${PAYSTACK_BASE}/subaccount/${user.paystackSubaccountCode}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${secret}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ active: false })
      });
      console.log(`[Paystack] Deactivated subaccount ${user.paystackSubaccountCode}`);
    } catch (err) {
      console.warn(`[Paystack] Failed to deactivate subaccount ${user.paystackSubaccountCode} on Paystack, proceeding with local deletion.`);
    }

    // 2. Remove locally
    await User.findByIdAndUpdate(userId, {
      $unset: {
        paystackSubaccountCode: "",
        paystackBankCode: "",
        paystackAccountNumber: ""
      }
    });

    res.status(200).json({
      success: true,
      message: "Payout settings deleted and deactivated on Paystack."
    });

  } catch (error) {
    console.error("Payout deletion error:", error);
    res.status(500).json({ success: false, message: "Server error during payout deletion" });
  }
};
