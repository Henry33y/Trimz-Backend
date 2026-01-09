import User from "../models/user.model.js";
import sendEmail from "../config/mail.config.js";
import bcrypt from "bcrypt";
import Appointment from "../models/appointment.model.js";

// Get system-wide stats (SuperAdmin only)
export const getSystemStats = async (req, res) => {
    try {
        const totalUsers = await User.countDocuments({ role: "user" });
        const totalProviders = await User.countDocuments({ role: "provider" });
        const totalAppointments = await Appointment.countDocuments();
        const pendingApprovals = await User.countDocuments({ role: "provider", status: "pending" });
        const totalAdmins = await User.countDocuments({ role: "admin" });

        // Calculate some basic revenue if needed, for now just counts
        // Get recent signups
        const recentSignups = await User.find({ role: { $in: ["user", "provider"] } })
            .select("name email role createdAt")
            .sort({ createdAt: -1 })
            .limit(5);

        res.status(200).json({
            success: true,
            data: {
                totalUsers,
                totalProviders,
                totalAppointments,
                pendingApprovals,
                totalAdmins,
                recentSignups
            }
        });
    } catch (error) {
        console.error("Error fetching system stats:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch system stats"
        });
    }
};

// Get providers (admin only)
export const getAllProvidersAdmin = async (req, res) => {
    try {
        // Check if route is /pending
        const isPendingRoute = req.path.includes('pending');

        let query = { role: "provider" };

        if (isPendingRoute) {
            query.status = "pending";
        } else if (req.query.status) {
            // Allow manual filtering via query param
            query.status = req.query.status;
        }

        const providers = await User.find(query)
            .select('-password')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            message: "Providers retrieved successfully",
            data: providers
        });
    } catch (error) {
        console.error("Error fetching providers:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch providers"
        });
    }
};

// Approve provider (admin only)
export const approveProviderAdmin = async (req, res) => {
    try {
        const { id } = req.params;

        const provider = await User.findById(id);

        if (!provider) {
            return res.status(404).json({
                success: false,
                message: "Provider not found"
            });
        }

        if (provider.role !== "provider") {
            return res.status(400).json({
                success: false,
                message: "User is not a provider"
            });
        }

        if (provider.status === "approved") {
            return res.status(200).json({
                success: true,
                message: "Provider already approved"
            });
        }

        // Update status and log history
        provider.status = "approved";
        provider.approvalHistory.push({
            status: "approved",
            changedBy: req.user._id,
            changedByEmail: req.user.email,
            reason: req.body.reason || "Approved by admin",
            timestamp: new Date()
        });
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
              <p>Your provider account has been approved by our team.</p>
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
            console.error("Failed to send approval email:", emailError);
        }

        res.status(200).json({
            success: true,
            message: `${provider.name} approved successfully!`,
            data: provider
        });
    } catch (error) {
        console.error("Error approving provider:", error);
        res.status(500).json({
            success: false,
            message: "Failed to approve provider"
        });
    }
};

// Reject provider (admin only)
export const rejectProviderAdmin = async (req, res) => {
    try {
        const { id } = req.params;

        const provider = await User.findById(id);

        if (!provider) {
            return res.status(404).json({
                success: false,
                message: "Provider not found"
            });
        }

        if (provider.role !== "provider") {
            return res.status(400).json({
                success: false,
                message: "User is not a provider"
            });
        }

        // Update status and log history
        provider.status = "rejected";
        provider.approvalHistory.push({
            status: "rejected",
            changedBy: req.user._id,
            changedByEmail: req.user.email,
            reason: req.body.reason || "Rejected by admin",
            timestamp: new Date()
        });
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
                message: `Your provider application has been reviewed.`
            });
        } catch (emailError) {
            console.error("Failed to send rejection email:", emailError);
        }

        res.status(200).json({
            success: true,
            message: `${provider.name}'s application rejected`,
            data: provider
        });
    } catch (error) {
        console.error("Error rejecting provider:", error);
        res.status(500).json({
            success: false,
            message: "Failed to reject provider"
        });
    }
};

// Create new admin (admin/superadmin only)
export const createAdminUser = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Validate inputs
        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "All fields are required"
            });
        }

        // Check if email already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "Email already in use"
            });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create admin user
        const newAdmin = await User.create({
            name,
            email,
            password: hashedPassword,
            role: "admin",
            verified: true,
            status: "active"
        });

        res.status(201).json({
            success: true,
            message: "Admin created successfully",
            data: {
                id: newAdmin._id,
                name: newAdmin.name,
                email: newAdmin.email,
                role: newAdmin.role
            }
        });
    } catch (error) {
        console.error("Error creating admin:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create admin"
        });
    }
};
