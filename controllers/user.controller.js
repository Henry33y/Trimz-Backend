import mongoose from 'mongoose'
import User from "../models/user.model.js";
import { hashPassword } from "../server.js";
import { createAuditLog } from './audit.controller.js';
import { sendApprovalEmail } from './providerApproval.controller.js';
import fs from 'fs'
import cloudinary from '../config/cloudinary.config.js';
import upload from '../config/upload.config.js';
import path from "path"
import { deleteFile } from '../config/functions.js';

export const getAllUsers = async (req, res) => {
    try {
        const users = await User.find({})
        res.status(200).json({ success: true, data: users, message: "Users retrieved successfully" })
    } catch (error) {
        console.log("Error in fetching users: ", error.message);
        return res.status(500).json({ success: false, message: `Server Error: ${error.message}` })
    }
}

export const getAllProviders = async (req, res) => {
    try {
        // Only return approved providers to customers
        const users = await User.find({ role: "provider", status: "approved" })
            .populate('services')
            .sort({ averageRating: -1 })
        res.status(200).json({ success: true, data: users, message: "Providers retrieved successfully" })
    } catch (error) {
        console.log("Error in fetching providers: ", error.message);
        return res.status(500).json({ success: false, message: `Server Error: ${error.message}` })
    }
}

export const getAllCustomers = async (req, res) => {
    try {
        const users = await User.find({ role: "customer" })
        res.status(200).json({ success: true, data: users, message: "Users retrieved successfully" })
    } catch (error) {
        console.log("Error in fetching users: ", error.message);
        return res.status(500).json({ success: false, message: `Server Error: ${error.message}` })
    }
}

export const getSingleUserById = async (req, res) => {
    const { id } = req.params

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(404).json({ success: false, message: "Invalid User ID" })
    }

    try {
        const user = await User.findById(id)
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        res.status(200).json({ success: true, data: user, message: "User retrieved successfully" })
    } catch (error) {
        console.log(`Error in fetching user with id ${id}: `, error.message);
        return res.status(500).json({ success: false, message: `Server Error: ${error.message}` })
    }
}

export const createNewUser = async (req, res) => {
    try {
        let { name, email, password, role, phone, location, verified, status, profilePicture, gender, available } = req.body

        // Handle potential stringified JSON from FormData
        // (Sometimes FormData sends everything as strings)

        const existingUser = await User.findOne({ email })

        if (existingUser) {
            return res.status(400).json({ success: false, message: "User already exists" })
        }

        const hash = await hashPassword(password)

        if (req.file) {
            console.log("File uploaded:", req.file.path);
            const imagePath = req.file.path

            // Upload image to Cloudinary with a specified folder
            const result = await cloudinary.uploader.upload(imagePath, {
                folder: 'ecutz/profilePictures'
            });

            profilePicture = {
                url: result.secure_url,
                public_id: result.public_id
            }
        }

        const newUser = new User({
            name,
            email,
            password: hash,
            role,
            gender,
            phone,
            location,
            status: role === "provider" ? "pending" : "active",
            profilePicture: req.file ? profilePicture : null,
            available: available || false,
        })

        const newCreatedUser = await newUser.save()

        if (req.file) {
            await deleteFile(req.file.path)
        }

        // Send approval email to owner if user is a provider
        if (role === "provider") {
            try {
                await sendApprovalEmail(newCreatedUser);
                console.log("Approval email sent to owner for provider:", newCreatedUser.email);
            } catch (emailError) {
                console.error("Failed to send approval email:", emailError.message);
                // Don't fail the registration if email fails, but log it
            }
        }

        // Determine the ID of the person performing the action (system or logged in admin)
        const auditorId = req.user ? req.user.id : (req.userId || "system");

        await createAuditLog(auditorId, newCreatedUser._id, "User", "create", "New User was created");

        res.status(201).json({ success: true, message: "User created successfully", data: newCreatedUser })
    } catch (error) {
        console.log(`Error in creating user: `, error.message);
        return res.status(500).json({ success: false, message: `Server Error: ${error.message}` })
    }
}


export const getUserProfile = async (req, res) => {
    // Standardize getting the ID from middleware
    const userId = req.userId || (req.user && req.user._id);

    try {
        const user = await User.findById(userId)

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' })
        }

        const { password, ...rest } = user._doc

        res.status(200).json({ success: true, message: 'Profile information retrieved successfully', data: { ...rest } });
    } catch (err) {
        res.status(500)
            .json({ success: false, message: "Something went wrong, cannot get profile" })
    }
}


export const updateUser = async (req, res) => {
    const { id } = req.params;

    // DEBUG: Log to confirm the route is hitting this controller
    console.log(`Update Request received for User ID: ${id}`);

    // Normalize the ID of the user performing the request
    const auditorId = req.userId || (req.user && req.user.id) || (req.user && req.user._id);

    try {
        let { name, email, password, gender, role, phone, location, verified, status, profilePicture, bio, about, workingHours, available, achievements, experience, specialization, timeSlots } = req.body;

        // console.log("Request Body:", req.body); // Uncomment if needed for debugging

        if (!mongoose.Types.ObjectId.isValid(id)) {
            console.log("Invalid Mongoose ID provided");
            return res.status(404).json({ success: false, message: "Invalid User ID format" })
        }

        // Check if user exists
        const user = await User.findById(id);
        if (!user) {
            console.log("User not found in DB");
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // Check if email is being updated and if it's unique
        if (email && email !== user.email) {
            const existingUser = await User.findOne({ email });
            if (existingUser) {
                return res.status(400).json({ success: false, message: "Email already in use" });
            }
        }

        // Helper function to safely parse JSON strings
        const safeParse = (value) => {
            if (typeof value === "string") {
                try {
                    return JSON.parse(value);
                } catch (error) {
                    console.error(`Error parsing JSON field: ${value}`, error.message);
                    return value; // Return original string if parse fails, or handle differently
                }
            }
            return value;
        };

        achievements = safeParse(achievements);
        timeSlots = safeParse(timeSlots);
        experience = safeParse(experience);
        specialization = safeParse(specialization);

        // Update profile picture if provided and delete the old one
        let updatedProfilePic = user.profilePicture
        if (req.file) {
            console.log("Processing new profile picture...");
            // Delete old profile picture from cloudinary if it exists
            if (user.profilePicture && user.profilePicture.public_id) {
                try {
                    await cloudinary.uploader.destroy(user.profilePicture.public_id);
                } catch (cErr) {
                    console.log("Error deleting old image from Cloudinary:", cErr.message);
                }
            }

            // Upload new profile picture to Cloudinary
            const result = await cloudinary.uploader.upload(req.file.path, {
                folder: 'ecutz/profilePictures',
            });
            updatedProfilePic = {
                url: result.secure_url,
                public_id: result.public_id,
            };

            // Clean up local file
            await deleteFile(req.file.path)
        }

        let hash = user.password
        if (password) {
            hash = await hashPassword(password)
        }

        // Map timeSlots (from frontend) to workingHours (in DB) if provided
        const finalWorkingHours = timeSlots || workingHours || user.workingHours;

        const updatedUser = {
            name: name || user.name,
            email: email || user.email,
            password: hash,
            role: role || user.role,
            gender: gender || user.gender,
            phone: phone || user.phone,
            location: location || user.location,
            bio: bio || user.bio,
            about: about || user.about,
            status: status || user.status,
            verified: verified || user.verified,
            profilePicture: req.file ? updatedProfilePic : profilePicture, // Use existing if no file, or new one
            available: available !== undefined ? available : user.available, // Handle boolean correctly
            achievements: achievements || user.achievements,
            experience: experience || user.experience,
            specialization: specialization || user.specialization,
            workingHours: finalWorkingHours,
        }

        const newUpdatedUser = await User.findByIdAndUpdate(id, updatedUser, { new: true })

        if (!newUpdatedUser) {
            return res.status(404).json({ success: false, message: "User update failed" });
        }

        // Audit Logging - Check if auditorId exists to prevent crash
        if (auditorId) {
            // Avoid logging the entire object to keep logs clean/performant
            await createAuditLog(auditorId, id, "User", "update", `User profile updated`);
        } else {
            console.warn("Audit Log skipped: No auditor ID found (req.user or req.userId missing)");
        }

        res.status(200).json({ success: true, message: "User Updated successfully", data: newUpdatedUser })

    } catch (error) {
        console.log(`Error in updating user with id ${id}: `, error.message);
        return res.status(500).json({ success: false, message: `Server Error: ${error.message}` })
    }
}

export const deleteUser = async (req, res) => {
    const { id } = req.params
    console.log("Delete request for ID:", id);

    const auditorId = req.userId || (req.user && req.user.id) || (req.user && req.user._id);

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(404).json({ success: false, message: "Invalid User ID" })
    }

    try {
        const deletedUser = await User.findByIdAndDelete(id)

        if (!deletedUser) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // Delete profile picture if it exists
        if (deletedUser.profilePicture && deletedUser.profilePicture.public_id) {
            try {
                await cloudinary.uploader.destroy(deletedUser.profilePicture.public_id);
            } catch (err) {
                console.log("Failed to delete image from Cloudinary:", err.message);
            }
        }

        if (auditorId) {
            await createAuditLog(auditorId, deletedUser._id, "User", "delete", "User Deleted");
        }

        res.status(200).json({ success: true, message: "User Deleted successfully" })
    } catch (error) {
        console.log(`Error in deleting user with id ${id}: ${error.message}`)
        return res.status(500).json({ success: false, message: `Server Error: ${error.message}` })
    }
}