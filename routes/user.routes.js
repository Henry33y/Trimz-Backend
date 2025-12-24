import { Router } from 'express';
import {
    getUserProfile,
    createNewUser,
    deleteUser,
    getAllCustomers,
    getAllProviders,
    getAllUsers,
    getSingleUserById,
    updateUser
} from '../controllers/user.controller.js';
import upload from '../config/upload.config.js';
import { requireAuth, restrict } from '../middlewares/auth.middleware.js';

const userRouter = Router();

// =================================================================
// 1. STATIC ROUTES (Must be defined BEFORE dynamic /:id routes)
// =================================================================

// Get current logged-in user profile
// URL: /api/v1/users/profile/me
userRouter.get("/profile/me", requireAuth, restrict(["user"]), getUserProfile);

// Get specific lists of users
// URL: /api/v1/users/providers
userRouter.get("/providers", getAllProviders);

// URL: /api/v1/users/customers
userRouter.get("/customers", getAllCustomers);

// =================================================================
// 2. BASE ROUTES
// =================================================================

// Get all users (Admin/General use)
// URL: /api/v1/users/
userRouter.get("/", getAllUsers);

// Create a new user
// URL: /api/v1/users/
userRouter.post("/", upload.single("profilePicture"), createNewUser);

// =================================================================
// 3. DYNAMIC ROUTES (Captures /:id)
// =================================================================

// ✅ THIS ROUTE FIXES YOUR GALLERY 404
// It must come last so it doesn't "swallow" requests to /providers or /profile
// URL: /api/v1/users/:id
userRouter.get("/:id", getSingleUserById);

// Update a specific user
// URL: /api/v1/users/:id
userRouter.patch("/:id", requireAuth, upload.single("profilePicture"), updateUser);

// Delete a specific user
// URL: /api/v1/users/:id
userRouter.delete("/:id", requireAuth, deleteUser);

export default userRouter;