import mongoose from "mongoose";
import Service from "../models/service.model.js";
import { createAuditLog } from "./audit.controller.js";
import cloudinary from "../config/cloudinary.config.js";
import { deleteFile } from "../config/functions.js";

export const getAllServices = async (req, res) => {
    try {
        const services = await Service.find({}).sort({ timestamp : -1 })
        res.status(200).json({success: true, data: services, message: "Services retrieved successfully"})
    } catch (error) {
        console.log("Error in fetching services: ", error.message);
        return res.status(500).json({success: false, message: `Server Error: ${error.message}`})
    }
}

export const getSingleService = async (req, res) => {
    const { id } = req.params

    if(!mongoose.Types.ObjectId.isValid(id)){
        return res.status(404).json({success:false, message: "Invalid Service ID"})
    }

    try {
        const service = await Service.findById(id)
        if (!service) {
            return res.status(404).json({ success: false, message: "Service not found" });
        }
        res.status(200).json({success: true, data: service, message: "Service retrieved successfully"})
    } catch (error) {
        console.log(`Error in fetching service with id ${ id }: `, error.message);
        return res.status(500).json({success: false, message: `Server Error: ${error.message}`})
    }
}

// ==========================================
// Create New Service (Single - Admin/Standard)
// ==========================================
export const createNewService = async (req, res) => {
    const request = req.body

    if (!request.title || !request.description || !request.category) {
        return res.status(400).json({ success: false, message: "Title, description, and category are required" });
    }

    try {
        const existingService = await Service.findOne({ title: new RegExp(`^${request.title}$`, 'i') })

        if(existingService){
            return res.status(400).json({success: false, message: "Service already exists"})
        }
        const newService = new Service(request)
        
        await newService.save()
        
        console.log(`User ID: ${ req.user.id }`, `ID: ${ newService._id }`);
        
        await createAuditLog(req.user ? req.user.id : "system", newService._id, "Service", "create", "Service created"); //Log user creation

        res.status(201).json({success: true, message: "Service created successfully", data: newService})
    } catch (error) {
        console.log("Error occured while saving service: ", error.message);
        return res.status(500).json({success: false, message: `Server Error: ${error.message}`})
    }
}

// ==========================================
// Create Services (Bulk - Provider with Images)
// ==========================================
export const createProviderServices = async (req, res) => {
    try {
        const { provider, services } = req.body;
        const parsedServices = JSON.parse(services); // Parse the JSON string
        const files = req.files || []; // Files uploaded via multer

        if (!parsedServices || parsedServices.length === 0) {
            return res.status(400).json({ success: false, message: "No services provided" });
        }

        const savedServices = [];
        let fileIndex = 0;

        // Iterate through services and attach images if flagged
        for (const serviceData of parsedServices) {
            let imageData = null;

            // If frontend flagged this service as having an image, take the next file from the array
            if (serviceData.hasImage && files[fileIndex]) {
                const file = files[fileIndex];
                
                // Upload to Cloudinary
                const result = await cloudinary.uploader.upload(file.path, {
                    folder: 'ecutz/services',
                });
                
                imageData = {
                    url: result.secure_url,
                    public_id: result.public_id
                };
                
                // Cleanup local file
                await deleteFile(file.path);
                fileIndex++;
            }

            // Create Service Record
            // Note: Using 'name' here as per frontend, mapping to 'title' if needed by your schema
            const newService = new Service({
                name: serviceData.name,
                title: serviceData.name, // Fallback if schema uses title
                description: serviceData.description,
                price: serviceData.price,
                duration: serviceData.duration,
                provider: provider, 
                image: imageData,
                availability: serviceData.availability !== undefined ? serviceData.availability : true,
                category: "Provider Service" // Default category if required
            });

            const savedService = await newService.save();
            savedServices.push(savedService);
        }

        const auditorId = req.user ? req.user.id : (provider || "system");
        await createAuditLog(auditorId, null, "Service", "bulk_create", `${savedServices.length} provider services created`);

        res.status(201).json({ 
            success: true, 
            message: "Services created successfully", 
            data: savedServices 
        });

    } catch (error) {
        console.error("Error creating provider services:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ==========================================
// Get Services by Provider
// ==========================================
export const getServicesByProvider = async (req, res) => {
    const { id } = req.params;
    try {
        const services = await Service.find({ provider: id });
        res.status(200).json({ success: true, data: services });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateService = async (req, res) => {
    const { id } = req.params
    const service = req.body

    if(!mongoose.Types.ObjectId.isValid(id)){
        return res.status(404).json({success:false, message: "Invalid Service ID"})
    }

    try{
        const updatedService = await Service.findByIdAndUpdate(id, service, { new: true })

        if (!updatedService) {
            return res.status(404).json({ success: false, message: "Service not found" });
        }

        await createAuditLog(req.user ? req.user.id : "system", id, "Service", "update", `Service updated with changes: ${JSON.stringify(service)}`);

        res.status(200).json({success: true, message: "Service Updated successfully", data: updatedService})
    } catch(error) {
        console.log(`Error occured while updating service with id ${id}: `, error.message);
        return res.status(500).json({success: false, message: `Server Error: ${error.message}`})
    }
}

export const deleteService = async (req, res) => {
    const { id } = req.params
    console.log("id:",id);

    if(!mongoose.Types.ObjectId.isValid(id)){
        return res.status(404).json({success:false, message: "Invalid Service ID"})
    }

    try {
        // First find the service to get image details
        const service = await Service.findById(id);
        
        if (!service) {
            return res.status(404).json({ success: false, message: "Service not found" });
        }

        // Delete image from Cloudinary if exists
        if (service.image && service.image.public_id) {
            try {
                await cloudinary.uploader.destroy(service.image.public_id);
            } catch (imgError) {
                console.log("Error deleting image from Cloudinary:", imgError.message);
            }
        }

        const deletedService = await Service.findByIdAndDelete(id)

        await createAuditLog(req.user ? req.user.id : "system", id, "Service", "delete", `Service deleted`);
        
        res.status(200).json({success: true, message: "Service Deleted successfully", data: deletedService})

    } catch (error) {
        console.log(`Error occurred while deleting service with id${id}: ${error.message}`)
        return res.status(500).json({success: false, message: `Server Error: ${error.message}`})
    }
}