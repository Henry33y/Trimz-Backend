import { Router } from "express";
import { approveProvider, rejectProvider } from "../controllers/providerApproval.controller.js";

const providerApprovalRouter = Router();

// Test route to verify routes are loaded
providerApprovalRouter.get("/test", (req, res) => {
    res.json({ message: "Provider approval routes are working!" });
});

// Approval routes (accessible via email links with token)
providerApprovalRouter.get("/approve/:id", approveProvider);
providerApprovalRouter.get("/reject/:id", rejectProvider);

export default providerApprovalRouter;
