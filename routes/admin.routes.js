import { Router } from "express";
import {
    getAllProvidersAdmin,
    approveProviderAdmin,
    rejectProviderAdmin,
    createAdminUser,
    getSystemStats,
    getAllAdmins,
    getFinancialData,
    getAuditLogs,
    getAllAppointmentsAdmin,
    updateAppointmentStatusAdmin,
    getPlatformConfig,
    updatePlatformConfig
} from "../controllers/admin.controller.js";
import { requireAuth, restrict } from "../middlewares/auth.middleware.js";

const adminRouter = Router();

// All routes require admin authentication
adminRouter.use(requireAuth);
adminRouter.use(restrict(["admin", "superadmin"]));

// Public health check for this router
adminRouter.get("/health", (req, res) => res.json({ status: "admin-router-active" }));

// Get system stats - SUPERADMIN ONLY
adminRouter.get("/platform-stats", restrict(["superadmin"]), getSystemStats);

// Get financial data - SUPERADMIN ONLY
adminRouter.get("/financials", restrict(["superadmin"]), getFinancialData);

// Get audit logs - SUPERADMIN ONLY
adminRouter.get("/audit-logs", restrict(["superadmin"]), getAuditLogs);

// Global Appointments - SUPERADMIN ONLY
adminRouter.get("/appointments", restrict(["superadmin"]), getAllAppointmentsAdmin);
adminRouter.put("/appointments/:id/status", restrict(["superadmin"]), updateAppointmentStatusAdmin);

// Platform Configuration - SUPERADMIN ONLY
adminRouter.get("/config", restrict(["superadmin"]), getPlatformConfig);
adminRouter.put("/config", restrict(["superadmin"]), updatePlatformConfig);

// Get all providers (including pending, approved, rejected)
adminRouter.get("/providers", getAllProvidersAdmin);

// Get pending providers
adminRouter.get("/providers/pending", getAllProvidersAdmin); // Controller handles filtering via query if needed, or we explicitly create a pending handler

// Approve a provider
adminRouter.post("/providers/:id/approve", approveProviderAdmin);

// Reject a provider
adminRouter.post("/providers/:id/reject", rejectProviderAdmin);

// Create new admin - RESTRICT TO SUPERADMIN ONLY
adminRouter.post("/create-admin", restrict(["superadmin"]), createAdminUser);

// Manage Admins list
adminRouter.get("/admins", restrict(["superadmin"]), getAllAdmins);

// Manage General Users list
adminRouter.get("/users", restrict(["superadmin"]), getAllUsersAdmin);

// Generic User CRUD (for SuperAdmin to manage anyone)
adminRouter.put("/users/:id", restrict(["superadmin"]), updateUserAdmin);
adminRouter.delete("/users/:id", restrict(["superadmin"]), deleteUserAdmin);

export default adminRouter;
