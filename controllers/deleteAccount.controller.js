import Appointment from '../models/appointment.model.js';
import Review from '../models/review.model.js';
import ProviderService from '../models/providerService.model.js';

// Delete user account (authenticated user only)
export const deleteUserAccount = async (req, res) => {
    try {
        const userId = req.user.id;

        // Find the user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Cancel all appointments
        await Appointment.deleteMany({
            $or: [
                { customer: userId },
                { provider: userId }
            ]
        });

        // Delete all reviews
        await Review.deleteMany({
            $or: [
                { user: userId },
                { provider: userId }
            ]
        });

        // Delete provider services if provider
        if (user.role === 'provider') {
            await ProviderService.deleteMany({ provider: userId });
        }

        // Delete profile picture from cloudinary if exists
        if (user.profilePicture?.public_id) {
            try {
                await cloudinary.uploader.destroy(user.profilePicture.public_id);
            } catch (cloudErr) {
                console.error('Error deleting profile picture:', cloudErr);
            }
        }

        // Delete gallery images if exists
        if (user.gallery && user.gallery.length > 0) {
            for (const image of user.gallery) {
                if (image.public_id) {
                    try {
                        await cloudinary.uploader.destroy(image.public_id);
                    } catch (cloudErr) {
                        console.error('Error deleting gallery image:', cloudErr);
                    }
                }
            }
        }

        // Finally delete the user
        await User.findByIdAndDelete(userId);

        // Create audit log
        await createAuditLog('system', userId, 'User', 'delete', `User account deleted: ${user.email}`);

        res.status(200).json({
            success: true,
            message: 'Account deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting user account:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete account'
        });
    }
};
