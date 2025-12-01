import { Router } from 'express';
import Appointment from '../models/appointment.model.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

const notificationRouter = Router();

// List notifications for the authenticated provider
// GET /api/notifications?status=unread|read|all&page=1&limit=20
notificationRouter.get('/', requireAuth, async (req, res) => {
    try {
        const status = (req.query.status || 'unread').toLowerCase();
        const page = Math.max(parseInt(req.query.page || '1', 10), 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);

        const query = { provider: req.user.id };
        if (status !== 'all') query.notificationStatus = status;

        const [items, total] = await Promise.all([
            Appointment.find(query)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .populate('customer', 'name')
                .populate('service', 'name'),
            Appointment.countDocuments(query)
        ]);

        res.status(200).json({
            success: true,
            data: items,
            pagination: { page, limit, total }
        });
    } catch (err) {
        console.error('Error fetching notifications:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Fast endpoint for unread count for the authenticated provider
notificationRouter.get('/count', requireAuth, async (req, res) => {
    try {
        const unread = await Appointment.countDocuments({
            provider: req.user.id,
            notificationStatus: 'unread'
        });
        res.status(200).json({ success: true, unread });
    } catch (err) {
        console.error('Error counting notifications:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get unread notifications for provider - protected route
// notificationRouter.get('/:providerId', requireAuth, async(req, res) => {
//     try {
//         // Add validation to ensure the user is requesting their own notifications
//         if (req.user._id.toString() !== req.params.providerId) {
//             return res.status(403).json({ 
//                 success: false, 
//                 message: 'Unauthorized access to notifications' 
//             });
//         }
//         try {
//         const notifications = await Appointment.find({
//                 provider: req.params.providerId,
//                 notificationStatus: 'unread'
//             })
//             .populate('customer', 'name')
//             .populate('service', 'name');
//         }catch(err) {
//             console.error('Error fetching notifications:', err);
//             res.status(500).json({ 
//                 success: false, 
//                 error: err.message
//             });
//         }
            
//         res.status(200).json({
//             success: true, 
//             data: notifications, 
//             message: 'Unread notifications fetched successfully'
//         });
//     } catch (err) {
//         console.error('Error fetching notifications:', err);
//         res.status(500).json({ 
//             success: false, 
//             error: err.message 
//         });
//     }
// });

// Mark all notifications as read for the authenticated provider
notificationRouter.patch('/read-all', requireAuth, async (req, res) => {
    try {
        const result = await Appointment.updateMany(
            { provider: req.user.id, notificationStatus: 'unread' },
            { $set: { notificationStatus: 'read' } }
        );
        res.status(200).json({ success: true, updated: result.modifiedCount || result.nModified || 0 });
    } catch (err) {
        console.error('Error marking all notifications as read:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Mark notification as read - protected route
notificationRouter.patch('/:id', requireAuth, async(req, res) => {
    try {
        // Find the notification first to verify ownership
        const notification = await Appointment.findById(req.params.id);
        
        if (!notification) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found'
            });
        }
        
        // Ensure the provider is updating their own notification
        if (notification.provider.toString() !== req.user.id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized to update this notification'
            });
        }

        await Appointment.findByIdAndUpdate(req.params.id, { notificationStatus: 'read' });
        
        res.status(200).json({ 
            success: true,
            message: 'Notification marked as read' 
        });
    } catch (err) {
        console.error('Error marking notification as read:', err);
        res.status(500).json({ 
            success: false, 
            error: err.message
        });
    }
});

// Mark all notifications as read for the authenticated provider
notificationRouter.patch('/read-all', requireAuth, async (req, res) => {
    try {
        const result = await Appointment.updateMany(
            { provider: req.user.id, notificationStatus: 'unread' },
            { $set: { notificationStatus: 'read' } }
        );
        res.status(200).json({ success: true, updated: result.modifiedCount || result.nModified || 0 });
    } catch (err) {
        console.error('Error marking all notifications as read:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

export default notificationRouter;