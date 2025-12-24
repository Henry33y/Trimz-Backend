import { Router } from "express";
import {
    getAllProvidersAdmin,
    approveProviderAdmin,
    rejectProviderAdmin,
    createAdminUser
} from "../controllers/admin.controller.js";
import { requireAuth, restrict } from "../middlewares/auth.middleware.js";

const adminRouter = Router();

// All routes require admin authentication
adminRouter.use(requireAuth);
adminRouter.use(restrict(["admin", "superadmin"]));

// Get all providers (including pending, approved, rejected)
// Get all providers
adminRouter.get("/providers", getAllProvidersAdmin);

// Get pending providers
adminRouter.get("/providers/pending", getAllProvidersAdmin); // Controller handles filtering via query if needed, or we explicitly create a pending handler

// Approve a provider
adminRouter.post("/providers/:id/approve", approveProviderAdmin);

// Reject a provider
adminRouter.post("/providers/:id/reject", rejectProviderAdmin);

// Create new admin
adminRouter.post("/create-admin", createAdminUser);

export default adminRouter;
