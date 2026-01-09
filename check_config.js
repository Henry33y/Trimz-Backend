import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Config from './models/config.model.js';

dotenv.config();

const checkConfig = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb+srv://ecutz:9O5N0v1oY3Wshsc4@ecutz.shard.mongodb.net/ECUTZ?retryWrites=true&w=majority');
        console.log('Connected to DB');
        const configs = await Config.find({});
        console.log('Current Configs:', JSON.stringify(configs, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

checkConfig();
