import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './models/user.model.js';

dotenv.config();

const checkBarbers = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb+srv://ecutz:9O5N0v1oY3Wshsc4@ecutz.shard.mongodb.net/ECUTZ?retryWrites=true&w=majority');
        const barbers = await User.find({ role: 'provider' });
        barbers.forEach(b => {
            console.log(`Barber: ${b.name}, Specialization:`, JSON.stringify(b.specialization));
        });
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

checkBarbers();
