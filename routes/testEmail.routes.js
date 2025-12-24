import express from 'express';
import sendEmail from '../config/mail.config.js';

const router = express.Router();

// Test email endpoint - GET /api/v1/test-email
router.get('/', async (req, res) => {
    try {
        const testEmail = process.env.OWNER_EMAIL || 'test@example.com';

        await sendEmail({
            receipient: testEmail,
            subject: 'Test Email from Trimz',
            message: 'If you receive this, email is working!',
            html: '<h1>✅ Email Configuration Works!</h1><p>Your email system is properly configured.</p>'
        });

        res.status(200).json({
            success: true,
            message: `Test email sent to ${testEmail}`,
            config: {
                host: process.env.MAIL_HOST,
                port: process.env.MAIL_PORT,
                user: process.env.MAIL_USER,
                ownerEmail: process.env.OWNER_EMAIL
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Email test failed',
            error: error.message
        });
    }
});

export default router;
