import mongoose from "mongoose";
import Appointment from "../models/appointment.model.js";
import { appointmentIsActive } from "../server.js";
import { createAuditLog } from "./audit.controller.js";
import ProviderService from '../models/providerService.model.js';


export const getAllAppointments = async (req, res) => {
    try {
        const appointments = await Appointment.find({})
        res.status(200).json({ success: true, data: appointments, message: "Appointments retrieved successfully" })
    } catch (error) {
        console.log("Error occurred while fetching appointments: ", error.message);
        return res.status(500).json({ success: false, message: `Server Error: ${error.message}` })
    }
}

export const getSingleAppointment = async (req, res) => {
    const { id } = req.params

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(404).json({ success: false, message: "Appointment not found" })
    }

    try {
        const appointment = await Appointment.findById(id)
        res.status(200).json({ success: true, data: appointment, message: "Appointment retrieved successfully" })
    } catch (error) {
        console.log(`Error occurred while fetching appointment with id ${id}: `, error.message);
        return res.status(500).json({ success: false, message: `Server Error: ${error.message}` })
    }
}

export const createAppointment = async (req, res) => {
    try {
        const request = req.body;
        request.customer = req.user.id;

        // Ensure providerServices is an array
        if (!Array.isArray(request.providerServices)) {
            request.providerServices = [request.providerServices];
        }

        // Validate the providerServices exist and belong to the provider
        const validServices = await ProviderService.find({
            _id: { $in: request.providerServices },
            provider: request.provider
        });

        if (validServices.length !== request.providerServices.length) {
            return res.status(400).json({ success: false, message: "One or more selected services are invalid or do not belong to this provider." });
        }

        // Check for overlapping appointments for this provider
        const startTime = new Date(request.startTime);
        const endTime = new Date(startTime.getTime() + request.duration * 60000); // Convert minutes to milliseconds

        const overlappingAppointment = await Appointment.findOne({
            provider: request.provider,
            date: request.date,
            $or: [
                { startTime: { $lt: endTime }, endTime: { $gt: startTime } }, // Overlapping check
            ]
        });

        if (overlappingAppointment) {
            return res.status(400).json({ success: false, message: "Provider is unavailable at the selected time." });
        }

        // Create the appointment
        const newAppointment = new Appointment(request);
        const savedAppointment = await newAppointment.save();

        // Populate customer and provider for detailed audit log
        await savedAppointment.populate('customer provider');

        // Create detailed audit log
        const customerName = savedAppointment.customer?.name || 'Unknown Customer';
        const providerName = savedAppointment.provider?.name || 'Unknown Provider';
        const appointmentDate = new Date(savedAppointment.date).toLocaleDateString();
        const auditDetails = `Customer "${customerName}" booked appointment with "${providerName}" for ${appointmentDate}`;

        await createAuditLog(
            req.user ? req.user.id : "system",
            newAppointment._id,
            "Appointment",
            "create",
            auditDetails
        );

        // Realtime notify provider (room is provider id)
        try {
            if (global._io) {
                global._io.to(String(savedAppointment.provider)).emit('notification:new', {
                    id: savedAppointment._id,
                    type: 'appointment_created',
                    provider: savedAppointment.provider,
                    customer: savedAppointment.customer,
                    date: savedAppointment.date,
                    startTime: savedAppointment.startTime,
                    service: savedAppointment.service,
                    notificationStatus: savedAppointment.notificationStatus
                });
            }
        } catch (emitErr) {
            console.error('Socket emit error (appointment created):', emitErr.message);
        }

        res.status(201).json({ success: true, message: "Appointment created successfully", data: savedAppointment });

    } catch (error) {
        console.log("Error occurred while saving Appointment: ", error.message);
        return res.status(500).json({ success: false, message: `Server Error: ${error.message}` });
    }
};


export const updateAppointment = async (req, res) => {
    const { id } = req.params

    const request = req.body

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(404).json({ success: false, message: "Appointment not found" })
    }

    try {
        // Get the original appointment before update
        const originalAppointment = await Appointment.findById(id).populate('customer provider');

        if (!originalAppointment) {
            return res.status(404).json({ success: false, message: "Appointment not found" });
        }

        const updatedAppointment = await Appointment.findByIdAndUpdate(id, request, { new: true })
            .populate('customer provider');

        if (!updatedAppointment) {
            return res.status(404).json({ success: false, message: "Appointment not found" });
        }

        // Create detailed audit log based on what changed
        let auditDetails = '';
        const changes = [];

        if (originalAppointment.status !== updatedAppointment.status) {
            changes.push(`status: ${originalAppointment.status} → ${updatedAppointment.status}`);

            // Special handling for cancellations
            if (updatedAppointment.status === 'cancelled') {
                const customerName = updatedAppointment.customer?.name || 'Unknown Customer';
                const providerName = updatedAppointment.provider?.name || 'Unknown Provider';
                const appointmentDate = new Date(updatedAppointment.date).toLocaleDateString();

                auditDetails = `Customer "${customerName}" cancelled appointment with "${providerName}" scheduled for ${appointmentDate}`;
            } else {
                auditDetails = `Appointment status changed from ${originalAppointment.status} to ${updatedAppointment.status}`;
            }
        }

        if (originalAppointment.date !== updatedAppointment.date) {
            changes.push(`date: ${originalAppointment.date} → ${updatedAppointment.date}`);
        }

        if (originalAppointment.startTime !== updatedAppointment.startTime) {
            changes.push(`time: ${originalAppointment.startTime} → ${updatedAppointment.startTime}`);
        }

        // If no specific detail was set, create a generic one
        if (!auditDetails && changes.length > 0) {
            auditDetails = `Appointment updated: ${changes.join(', ')}`;
        } else if (!auditDetails) {
            auditDetails = 'Appointment details updated';
        }

        await createAuditLog(
            req.user ? req.user.id : "system",
            id,
            "Appointment",
            updatedAppointment.status === 'cancelled' ? 'cancel' : 'update',
            auditDetails
        );

        // Emit update event for provider if appointment still exists
        try {
            if (updatedAppointment && global._io) {
                global._io.to(String(updatedAppointment.provider)).emit('notification:update', {
                    id: updatedAppointment._id,
                    type: updatedAppointment.status === 'cancelled' ? 'appointment_cancelled' : 'appointment_updated',
                    provider: updatedAppointment.provider,
                    customer: updatedAppointment.customer,
                    date: updatedAppointment.date,
                    startTime: updatedAppointment.startTime,
                    status: updatedAppointment.status
                });
            }
        } catch (emitErr) {
            console.error('Socket emit error (appointment updated):', emitErr.message);
        }

        res.status(200).json({ success: true, message: "Appointment Updated successfully", data: updatedAppointment })
    } catch (error) {
        console.log(`Error occured while updating appointment with id ${id}: `, error.message);
        return res.status(500).json({ success: false, message: `Server Error: ${error.message}` })
    }
}

export const deleteAppointment = async (req, res) => {
    const { id } = req.params
    console.log("id:", id);

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(404).json({ success: false, message: "Appointment not found" })
    }

    try {
        const deletedAppointment = await Appointment.findByIdAndDelete(id)
            .populate('customer provider');

        if (!deletedAppointment) {
            return res.status(404).json({ success: false, message: "Appointment not found" });
        }

        // Create detailed audit log
        const customerName = deletedAppointment.customer?.name || 'Unknown Customer';
        const providerName = deletedAppointment.provider?.name || 'Unknown Provider';
        const appointmentDate = new Date(deletedAppointment.date).toLocaleDateString();
        const auditDetails = `Appointment between "${customerName}" and "${providerName}" for ${appointmentDate} was deleted`;

        await createAuditLog(
            req.user ? req.user.id : "system",
            id,
            "Appointment",
            "delete",
            auditDetails
        );

        // Notify provider of deletion/cancellation
        try {
            if (deletedAppointment && global._io) {
                global._io.to(String(deletedAppointment.provider)).emit('notification:delete', {
                    id: deletedAppointment._id,
                    type: 'appointment_deleted',
                    provider: deletedAppointment.provider,
                    customer: deletedAppointment.customer
                });
            }
        } catch (emitErr) {
            console.error('Socket emit error (appointment deleted):', emitErr.message);
        }

        res.status(200).json({ success: true, message: "Appointment Deleted successfully" })

    } catch (error) {
        console.log(`Error in deleting appointment with id ${id}: ${error.message}`)
        return res.status(500).json({ success: false, message: `Server Error: ${error.message}` })
    }
}

export const getUserAppointments = async (req, res) => {
    try {
        console.log('User: ', req.user);
        const appointments = await Appointment.find({ customer: req.user.id }).populate('provider').populate('providerServices').sort({ createdAt: -1 });
        console.log(appointments);

        if (!appointments || appointments.length === 0) {
            return res.status(200).json({
                success: true,
                message: "No appointments found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Appointments fetched successfully",
            data: appointments
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Something went wrong, cannot get user appointments"
        });
    }
}
export const getProviderAppointments = async (req, res) => {
    try {
        const appointments = await Appointment.find({ provider: req.user.id })
            .populate('customer')
            .populate('providerServices');

        console.log('Provider Appointments:', appointments);

        // Always return 200, even if the array is empty
        res.status(200).json({
            success: true,
            message: appointments.length > 0 ? "Appointments fetched successfully" : "No appointments found",
            data: appointments // will be [] if none exist
        });
    } catch (err) {
        console.error('Error fetching provider appointments:', err.message);
        res.status(500).json({
            success: false,
            message: "Something went wrong, cannot get provider appointments"
        });
    }
};
