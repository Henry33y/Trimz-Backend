import mongoose from 'mongoose';
import User from './models/user.model.js';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
    // Update all providers with status "inactive" to "pending"
    const result = await User.updateMany(
        { role: 'provider', status: 'inactive' },
        { status: 'pending' }
    );
    console.log(`Updated ${result.modifiedCount} provider(s) from inactive to pending`);

    // Count all pending providers
    const pendingCount = await User.countDocuments({ role: 'provider', status: 'pending' });
    console.log(`Total pending providers: ${pendingCount}`);

    process.exit(0);
}).catch(e => {
    console.error('Error:', e);
    process.exit(1);
});
