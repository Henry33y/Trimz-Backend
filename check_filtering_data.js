import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './models/user.model.js';
import ProviderService from './models/providerService.model.js';

dotenv.config();

const checkData = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb+srv://ecutz:9O5N0v1oY3Wshsc4@ecutz.shard.mongodb.net/ECUTZ?retryWrites=true&w=majority');

        console.log("--- PROVIDERS ---");
        const providers = await User.find({ role: 'provider' }).populate('services');
        providers.forEach(p => {
            console.log(`Name: ${p.name}`);
            console.log(`- Status: ${p.status}`);
            console.log(`- Specialization: ${JSON.stringify(p.specialization)}`);
            console.log(`- Services Count: ${p.services?.length || 0}`);
            p.services?.forEach(s => {
                console.log(`  * Service: ${s.name}, Category: ${s.category}`);
            });
            console.log('----------------');
        });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

checkData();
