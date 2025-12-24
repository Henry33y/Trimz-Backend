import { Router } from "express";
import { 
    createNewService, 
    deleteService, 
    getAllServices, 
    getSingleService, 
    updateService,
    createProviderServices,
    getServicesByProvider
} from "../controllers/service.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import upload from "../config/upload.config.js";

const serviceRouter = Router()

// ==============================
// Provider Specific Routes
// (Must come BEFORE generic /:id routes to prevent conflict)
// ==============================

// Get all services for a specific provider
serviceRouter.get("/provider/:id", requireAuth, getServicesByProvider);

// Bulk create services for a provider (with images)
serviceRouter.post("/provider", requireAuth, upload.array('images'), createProviderServices);


// ==============================
// General Service Routes
// ==============================

serviceRouter.get("/", getAllServices)
serviceRouter.get("/:id", getSingleService) //Get a single service
serviceRouter.post("/", requireAuth, createNewService)
serviceRouter.patch("/:id", requireAuth, updateService)
serviceRouter.delete("/:id", requireAuth, deleteService)

export default serviceRouter