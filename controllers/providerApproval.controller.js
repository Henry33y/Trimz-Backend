import User from "../models/user.model.js";
import jwt from "jsonwebtoken";
import sendEmail from "../config/mail.config.js";

// Generate approval token
export const generateApprovalToken = (providerId) => {
    return jwt.sign(
        { providerId: providerId.toString() }, // Convert to string
        process.env.APPROVAL_SECRET || process.env.JWT_SECRET,
        { expiresIn: "7d" } // 7 days to approve
    );
};

// Send approval email to owner
export const sendApprovalEmail = async (provider) => {
    try {
        const approvalToken = generateApprovalToken(provider._id);
        const apiUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5002}`;
        const approvalLink = `${apiUrl}/api/v1/providers/approve/${provider._id}?token=${approvalToken}`;
        const rejectLink = `${apiUrl}/api/v1/providers/reject/${provider._id}?token=${approvalToken}`;

        const ownerEmail = process.env.OWNER_EMAIL || process.env.EMAIL_USER;

        if (!ownerEmail) {
            console.error("OWNER_EMAIL not configured in environment variables");
            return;
        }

        const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            background-color: #f4f4f4;
            padding: 20px;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
          }
          .header h1 {
            color: #1e293b;
            margin: 0;
          }
          .badge {
            display: inline-block;
            background: #f59e0b;
            color: white;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: bold;
            margin-top: 8px;
          }
          .provider-info {
            background: #f8fafc;
            border-left: 4px solid #3b82f6;
            padding: 15px 20px;
            margin: 20px 0;
            border-radius: 4px;
          }
          .provider-info p {
            margin: 8px 0;
            color: #475569;
          }
          .provider-info strong {
            color: #1e293b;
          }
          .button-container {
            text-align: center;
            margin: 30px 0;
          }
          .button {
            display: inline-block;
            padding: 14px 32px;
            margin: 0 8px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: bold;
            font-size: 16px;
            transition: all 0.3s;
          }
          .approve-btn {
            background-color: #10b981;
            color: white;
          }
          .approve-btn:hover {
            background-color: #059669;
          }
          .reject-btn {
            background-color: #ef4444;
            color: white;
          }
          .reject-btn:hover {
            background-color: #dc2626;
          }
          .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e2e8f0;
            color: #64748b;
            font-size: 14px;
          }
          .warning {
            background: #fef3c7;
            border-left: 4px solid #f59e0b;
            padding: 12px 20px;
            margin: 20px 0;
            border-radius: 4px;
            font-size: 13px;
            color: #92400e;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔔 New Provider Awaiting Approval</h1>
            <span class="badge">ACTION REQUIRED</span>
          </div>

          <p>A new provider has signed up and is waiting for your approval to start offering services on Trimz.</p>

          <div class="provider-info">
            <p><strong>Name:</strong> ${provider.name}</p>
            <p><strong>Email:</strong> ${provider.email}</p>
            <p><strong>Specialization:</strong> ${provider.specialization?.title || "Not specified"}</p>
            <p><strong>Location:</strong> ${provider.location || "Not specified"}</p>
            <p><strong>Registered:</strong> ${new Date().toLocaleString()}</p>
          </div>

          <div class="warning">
            ⚠️ This provider cannot upload services or appear to customers until approved.
          </div>

          <div class="button-container">
            <a href="${approvalLink}" class="button approve-btn">
              ✅ Approve Provider
            </a>
            <a href="${rejectLink}" class="button reject-btn">
              ❌ Reject
            </a>
          </div>

          <div class="footer">
            <p>This link expires in 7 days.</p>
            <p>&copy; ${new Date().getFullYear()} Trimz. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

        const emailResult = await sendEmail({
            receipient: ownerEmail,
            subject: "🔔 New Provider Awaiting Approval - Trimz",
            html: htmlContent,
            message: `New provider ${provider.name} (${provider.email}) awaiting approval.`
        });

        console.log("Approval email sent to owner:", ownerEmail);
        return emailResult;
    } catch (error) {
        console.error("Error sending approval email:", error);
        throw error;
    }
};

// Approve provider
export const approveProvider = async (req, res) => {
    try {
        const { id } = req.params;
        const { token } = req.query;

        if (!token) {
            return res.status(400).send(`
        <html>
          <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1 style="color: #ef4444;">❌ Invalid Request</h1>
            <p>Approval token is missing.</p>
          </body>
        </html>
      `);
        }

        console.log("Approval attempt:");
        console.log("- Provider ID:", id);
        console.log("- Token received:", token.substring(0, 20) + "...");
        console.log("- Using secret:", process.env.APPROVAL_SECRET ? "APPROVAL_SECRET" : "JWT_SECRET");

        // Verify token
        let decoded;
        try {
            const secret = process.env.APPROVAL_SECRET || process.env.JWT_SECRET;
            decoded = jwt.verify(token, secret);
            console.log("- Token decoded successfully");
            console.log("- Decoded provider ID:", decoded.providerId);
        } catch (jwtError) {
            console.error("JWT Verification Error:", jwtError.message);
            console.error("Error type:", jwtError.name);

            // Re-throw to be caught by outer catch block
            throw jwtError;
        }

        if (decoded.providerId !== id) {
            console.error("Provider ID mismatch!");
            console.error("- Token says:", decoded.providerId);
            console.error("- URL says:", id);

            return res.status(401).send(`
        <html>
          <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1 style="color: #ef4444;">❌ Invalid Token</h1>
            <p>The approval token does not match the provider ID.</p>
            <p style="font-size: 12px; color: #666;">Token contains: ${decoded.providerId}<br>URL contains: ${id}</p>
          </body>
        </html>
      `);
        }

        // Find and approve provider
        const provider = await User.findById(id);

        if (!provider) {
            return res.status(404).send(`
        <html>
          <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1 style="color: #ef4444;">❌ Provider Not Found</h1>
            <p>The provider you're trying to approve doesn't exist.</p>
          </body>
        </html>
      `);
        }

        if (provider.status === "approved") {
            return res.status(200).send(`
        <html>
          <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1 style="color: #f59e0b;">⚠️ Already Approved</h1>
            <p>${provider.name} has already been approved.</p>
          </body>
        </html>
      `);
        }

        // Update status
        provider.status = "approved";
        await provider.save();

        // Send confirmation email to provider
        try {
            await sendEmail({
                receipient: provider.email,
                subject: "🎉 Your Trimz Provider Account Has Been Approved!",
                html: `
          <html>
            <body style="font-family: Arial; padding: 20px;">
              <h1 style="color: #10b981;">🎉 Congratulations, ${provider.name}!</h1>
              <p>Your provider account has been approved.</p>
              <p>You can now:</p>
              <ul>
                <li>Upload your services</li>
                <li>Appear in customer searches</li>
                <li>Start receiving bookings</li>
              </ul>
              <p><a href="${process.env.FRONTEND_URL}/login" style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px;">Login to Your Account</a></p>
              <p style="margin-top: 30px; color: #64748b;">Best regards,<br>The Trimz Team</p>
            </body>
          </html>
        `,
                message: `Your provider account has been approved!`
            });
        } catch (emailError) {
            console.error("Failed to send approval confirmation email:", emailError);
        }

        res.status(200).send(`
      <html>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h1 style="color: #10b981;">✅ Provider Approved Successfully!</h1>
          <p><strong>${provider.name}</strong> can now upload services and appear to customers.</p>
          <p style="color: #64748b; margin-top: 30px;">You can close this window.</p>
        </body>
      </html>
    `);
    } catch (error) {
        console.error("Provider approval error:", error);

        if (error.name === "JsonWebTokenError") {
            return res.status(401).send(`
        <html>
          <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1 style="color: #ef4444;">❌ Invalid Token</h1>
            <p>The approval link is invalid or corrupted.</p>
          </body>
        </html>
      `);
        }

        if (error.name === "TokenExpiredError") {
            return res.status(401).send(`
        <html>
          <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1 style="color: #ef4444;">❌ Link Expired</h1>
            <p>This approval link has expired. Please contact the provider to resend.</p>
          </body>
        </html>
      `);
        }

        res.status(500).send(`
      <html>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h1 style="color: #ef4444;">❌ Server Error</h1>
          <p>Failed to approve provider. Please try again.</p>
        </body>
      </html>
    `);
    }
};

// Reject provider
export const rejectProvider = async (req, res) => {
    try {
        const { id } = req.params;
        const { token } = req.query;

        if (!token) {
            return res.status(400).send(`
        <html>
          <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1 style="color: #ef4444;">❌ Invalid Request</h1>
            <p>Rejection token is missing.</p>
          </body>
        </html>
      `);
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.APPROVAL_SECRET || process.env.JWT_SECRET);

        if (decoded.providerId !== id) {
            return res.status(401).send(`
        <html>
          <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1 style="color: #ef4444;">❌ Invalid Token</h1>
            <p>The rejection token does not match the provider ID.</p>
          </body>
        </html>
      `);
        }

        // Find and reject provider
        const provider = await User.findById(id);

        if (!provider) {
            return res.status(404).send(`
        <html>
          <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1 style="color: #ef4444;">❌ Provider Not Found</h1>
            <p>The provider you're trying to reject doesn't exist.</p>
          </body>
        </html>
      `);
        }

        // Update status
        provider.status = "rejected";
        await provider.save();

        // Send notification email to provider
        try {
            await sendEmail({
                receipient: provider.email,
                subject: "Trimz Provider Application Update",
                html: `
          <html>
            <body style="font-family: Arial; padding: 20px;">
              <h1 style="color: #ef4444;">Application Status Update</h1>
              <p>Dear ${provider.name},</p>
              <p>Thank you for your interest in becoming a provider on Trimz.</p>
              <p>After review, we're unable to approve your application at this time. If you believe this is an error or would like to reapply, please contact our support team.</p>
              <p style="margin-top: 30px; color: #64748b;">Best regards,<br>The Trimz Team</p>
            </body>
          </html>
        `,
                message: `Your provider application status has been updated.`
            });
        } catch (emailError) {
            console.error("Failed to send rejection email:", emailError);
        }

        res.status(200).send(`
      <html>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h1 style="color: #ef4444;">Provider Rejected</h1>
          <p><strong>${provider.name}</strong>'s application has been rejected.</p>
          <p style="color: #64748b; margin-top: 30px;">You can close this window.</p>
        </body>
      </html>
    `);
    } catch (error) {
        console.error("Provider rejection error:", error);
        res.status(500).send(`
      <html>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h1 style="color: #ef4444;">❌ Server Error</h1>
          <p>Failed to reject provider. Please try again.</p>
        </body>
      </html>
    `);
    }
};
