import mongoose from 'mongoose';
import User from './models/user.model.js';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
    const result = await User.updateOne(
        { email: 'philipaopoku19@gmail.com' },
        { status: 'pending' }
    );
    console.log('Updated provider status to pending:', result.modifiedCount, 'document(s)');

    const provider = await User.findOne({ email: 'philipaopoku19@gmail.com' });
    console.log('Verified status:', provider.status);

    process.exit(0);
}).catch(e => console.error(e));
