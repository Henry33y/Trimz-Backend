import User from "../models/user.model.js";
import sendEmail from "../config/mail.config.js";
import bcrypt from "bcrypt";
import Appointment from "../models/appointment.model.js";
import { logActivity } from "../utils/auditLogger.js";
import AuditLog from "../models/audit.model.js";
import Config from "../models/config.model.js";

// Get system-wide stats (SuperAdmin only)
export const getSystemStats = async (req, res) => {
    try {
        const totalUsers = await User.countDocuments({ role: "customer" });
        const totalProviders = await User.countDocuments({ role: "provider" });
        const totalAppointments = await Appointment.countDocuments();
        const pendingApprovals = await User.countDocuments({ role: "provider", status: "pending" });
        const totalAdmins = await User.countDocuments({ role: "admin" });

        // Calculate some basic revenue if needed, for now just counts
        // Get recent signups
        const recentSignups = await User.find({ role: { $in: ["customer", "provider"] } })
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

        // LOG ACTION
        await logActivity({
            action: "approve_provider",
            user: req.user,
            target: provider._id,
            targetModel: "User",
            details: `Approved provider application for ${provider.name}`
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

        // LOG ACTION
        await logActivity({
            action: "reject_provider",
            user: req.user,
            target: provider._id,
            targetModel: "User",
            details: `Rejected provider application for ${provider.name}. Reason: ${req.body.reason || 'No reason specified'}`
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

        // LOG ACTION
        await logActivity({
            action: "create_admin",
            user: req.user,
            target: newAdmin._id,
            targetModel: "User",
            details: `Forged new admin profile for ${newAdmin.name}`
        });
    } catch (error) {
        console.error("Error creating admin:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create admin"
        });
    }
};

// Get all admins (superadmin only)
export const getAllAdmins = async (req, res) => {
    try {
        const admins = await User.find({ role: "admin" }).select("-password").sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: admins });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch admins" });
    }
};

// Get all general users/customers (superadmin only)
export const getAllUsersAdmin = async (req, res) => {
    try {
        const users = await User.find({ role: "customer" }).select("-password").sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: users });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch users" });
    }
};

// Update any user details (superadmin only)
export const updateUserAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, role, status, verified } = req.body;

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // Prevent modifying other superadmins unless we decide otherwise
        if (user.role === 'superadmin' && req.user.role !== 'superadmin') {
            return res.status(403).json({ success: false, message: "Cannot modify superadmin" });
        }

        if (name) user.name = name;
        if (email) user.email = email;
        if (role) user.role = role;
        if (status) user.status = status;
        if (verified !== undefined) user.verified = verified;

        await user.save();

        res.status(200).json({
            success: true,
            message: "User updated successfully",
            data: user
        });

        // LOG ACTION
        await logActivity({
            action: "update_user",
            user: req.user,
            target: user._id,
            targetModel: "User",
            details: `Modified profile for ${user.name} (${user.role})`
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to update user" });
    }
};

// Delete user (superadmin only)
export const deleteUserAdmin = async (req, res) => {
    try {
        const { id } = req.params;

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        if (user.role === 'superadmin') {
            return res.status(403).json({ success: false, message: "Cannot delete superadmin accounts" });
        }

        await User.findByIdAndDelete(id);

        res.status(200).json({
            success: true,
            message: "User account deleted successfully"
        });

        // LOG ACTION
        await logActivity({
            action: "delete_user",
            user: req.user,
            target: user._id,
            targetModel: "User",
            details: `Permanently deleted user: ${user.name} (${user.email})`
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to delete user" });
    }
};

// --- NEW FINANCIALS CONTROL ---

export const getFinancialData = async (req, res) => {
    try {
        // 1. Transaction History (Paid Appointments)
        const transactions = await Appointment.find({ paymentStatus: "paid" })
            .populate("customer", "name email")
            .populate("provider", "name email")
            .sort({ updatedAt: -1 })
            .limit(50);

        // 2. Gross Volume (Sum of all paid appointments)
        const allPaid = await Appointment.find({ paymentStatus: "paid" });
        const grossVolume = allPaid.reduce((sum, app) => sum + parseFloat(app.totalPrice || 0), 0);

        // 3. Projected Earnings (Sum of pending/in-progress for current month)
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const pendingApps = await Appointment.find({
            paymentStatus: "pending",
            status: { $in: ["pending", "in-progress"] },
            date: { $gte: startOfMonth }
        });
        const projectedEarnings = pendingApps.reduce((sum, app) => sum + parseFloat(app.totalPrice || 0), 0);

        res.status(200).json({
            success: true,
            data: {
                grossVolume,
                projectedEarnings,
                transactions
            }
        });
    } catch (error) {
        console.error("Financial fetch error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch financials" });
    }
};

// --- NEW AUDIT CONTROL ---

export const getAuditLogs = async (req, res) => {
    try {
        const logs = await AuditLog.find({})
            .sort({ timestamp: -1 })
            .limit(100);

        res.status(200).json({
            success: true,
            data: logs
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch system logs" });
    }
};

// --- NEW GOD-VIEW APPOINTMENTS ---

export const getAllAppointmentsAdmin = async (req, res) => {
    try {
        const { status } = req.query;
        let query = {};

        if (status && status !== 'all') {
            query.status = status;
        }

        const appointments = await Appointment.find(query)
            .populate("customer", "name email")
            .populate("provider", "name email")
            .populate("service", "title")
            .sort({ date: -1, startTime: -1 })
            .limit(200);

        res.status(200).json({ success: true, data: appointments });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch global appointments" });
    }
};

export const updateAppointmentStatusAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const appointment = await Appointment.findById(id).populate("customer", "name");
        if (!appointment) return res.status(404).json({ success: false, message: "Appointment not found" });

        const oldStatus = appointment.status;
        appointment.status = status;
        await appointment.save();

        // LOG ACTION
        await logActivity({
            action: "force_update_appointment",
            user: req.user,
            target: appointment._id,
            targetModel: "Appointment",
            details: `Force updated appointment status from ${oldStatus} to ${status} (Customer: ${appointment.customer?.name})`
        });

        res.status(200).json({ success: true, message: `Appointment status updated to ${status}` });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to update appointment" });
    }
};

// --- NEW PLATFORM CONFIG ---

export const getPlatformConfig = async (req, res) => {
    try {
        const configs = await Config.find({});
        // Map to object for easier frontend use
        const configMap = {};
        configs.forEach(c => {
            configMap[c.key] = c.value;
        });

        // Add defaults if not set
        if (!configMap.commission_rate) configMap.commission_rate = 15;
        if (!configMap.customer_fee_percent) configMap.customer_fee_percent = 5;
        if (!configMap.provider_fee_percent) configMap.provider_fee_percent = 5;
        if (configMap.maintenance_mode === undefined) configMap.maintenance_mode = false;
        if (!configMap.service_categories) configMap.service_categories = ["barber", "hairdresser", "stylist", "other"];
        if (!configMap.available_locations) configMap.available_locations = [
            "UG - Commonwealth Hall", "UG - Sarbah Hall", "UG - Legon Hall",
            "UG - Akuafo Hall", "UG - Volta Hall", "UG - Limann Hall",
            "UG - Kwapong Hall", "UG - Bani", "UG - Evandy", "Legon",
            "East Legon", "Madina", "Atomic"
        ];

        res.status(200).json({ success: true, data: configMap });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch platform config" });
    }
};

export const updatePlatformConfig = async (req, res) => {
    try {
        const { settings } = req.body; // Expecting an object of { key: value }

        for (const [key, value] of Object.entries(settings)) {
            await Config.findOneAndUpdate(
                { key },
                { key, value },
                { upsert: true, new: true }
            );
        }

        // LOG ACTION
        await logActivity({
            action: "update_platform_config",
            user: req.user,
            target: req.user._id,
            targetModel: "User",
            details: `Updated platform global settings: ${Object.keys(settings).join(', ')}`
        });

        res.status(200).json({ success: true, message: "Platform configuration updated successfully" });
    } catch (error) {
        console.error("Config update error:", error);
        res.status(500).json({ success: false, message: "Failed to update platform config" });
    }
};
