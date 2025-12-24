// Script to create an admin/owner account
// Run with: node createAdmin.js

import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import User from './models/user.model.js';

dotenv.config();

const createAdmin = async () => {
    try {
        // Connect to database
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // Admin details - CHANGE THESE!
        const adminData = {
            name: 'Admin Owner',
            email: 'asiedudennis1@gmail.com', // Change this to your email
            password: await bcrypt.hash('trimz123', 10), // Change this password!
            role: 'admin',
            verified: true
        };

        // Check if admin already exists
        const existingAdmin = await User.findOne({ email: adminData.email });

        if (existingAdmin) {
            console.log('❌ Admin user already exists with email:', adminData.email);
            process.exit(0);
        }

        // Create admin
        const admin = await User.create(adminData);

        console.log('✅ Admin user created successfully!');
        console.log('📧 Email:', admin.email);
        console.log('🔑 Password: trimz123 (CHANGE THIS AFTER FIRST LOGIN!)');
        console.log('👤 Role:', admin.role);
        console.log('\n🚀 You can now login at /login and access /admin/dashboard');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error creating admin:', error.message);
        process.exit(1);
    }
};

createAdmin();
