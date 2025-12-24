import mongoose from "mongoose";

export const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 5000, // Fail faster if server is unreachable
            socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
        })
        console.log("Database connection successful: ", conn.connection.host)
    } catch (error) {
        console.error("MongoDB Connection Error: ", error.message);
        // Do not exit process immediately, let it retry or fail gracefully if handled by caller
        // process.exit(1) 
        throw error;
    }
}