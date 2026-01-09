import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Config from './models/config.model.js';

dotenv.config();

const checkConfig = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb+srv://ecutz:9O5N0v1oY3Wshsc4@ecutz.shard.mongodb.net/ECUTZ?retryWrites=true&w=majority');
        const configs = await Config.find({});
        configs.forEach(c => {
            console.log(`Key: "${c.key}", Value Type: ${Array.isArray(c.value) ? 'Array' : typeof c.value}, Value:`, c.value);
        });
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

checkConfig();
