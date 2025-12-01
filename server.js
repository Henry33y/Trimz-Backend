import express from "express"
import { createServer } from 'http'
import { Server as SocketIOServer } from 'socket.io'
import jwt from 'jsonwebtoken'
import dotenv from "dotenv"
import { connectDB } from "./config/db.js"
import multer from "multer"
import bcrypt from "bcrypt"
import updateExpiredAppointments from './controllers/cron.controller.js';
import cron from 'node-cron'
import userRouter from "./routes/user.routes.js"
import serviceRouter from "./routes/service.routes.js"
import reviewRouter from "./routes/review.routes.js"
import providerServiceRouter from "./routes/providerService.routes.js"
import appointmentRouter from "./routes/appointment.routes.js"
import auditRouter from "./routes/audit.routes.js"
import cors from 'cors'
import { getAllowedOrigins } from './config/frontendUrl.js'
import loginRouter from "./routes/auth.routes.js"
import cookieParser from "cookie-parser"
import cloudinary from "./config/cloudinary.config.js"
import galleryRouter from "./routes/gallery.routes.js"
import { updateAverageRating } from "./controllers/rating.controller.js"
import ratingRouter from "./routes/rating.routes.js"
import passport from "passport"
import "./config/passport.config.js"
import notificationRouter from "./routes/notification.routes.js"
import paymentRouter from "./routes/payment.routes.js"
import { paystackWebhook } from './controllers/payment.controller.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5000
let io; // will hold socket.io instance

// CORS: allow both local and production frontends via helper
const allowedOrigins = getAllowedOrigins();

app.use(cors({
  origin: (origin, callback) => {
    // Allow REST tools without origin (e.g., Postman) and same-origin
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 600
}));

// Security headers middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// Paystack webhook must read raw body for signature verification
app.post('/api/payments/webhook', express.raw({ type: '*/*' }), paystackWebhook);

// Body parsing middleware (after raw webhook route)
app.use(express.json({ limit: '10mb' })); // Limit JSON body size
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Initialize authentication
app.use(passport.initialize());

// API Routes
app.use("/api/users", userRouter);
app.use("/api/services", serviceRouter);
app.use("/api/reviews", reviewRouter);
app.use("/api/provider-services", providerServiceRouter);
app.use("/api/audit-logs", auditRouter);
app.use("/api/appointments", appointmentRouter);
app.use("/api", loginRouter);
app.use("/api/users/gallery", galleryRouter);
app.use("/api/rating", ratingRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/payments', paymentRouter);

//cron job
// Start background job
cron.schedule('* * * * *', updateExpiredAppointments); // Every minute
cron.schedule("0 0 * * *", updateAverageRating);

//function to hash passwords
export const hashPassword = async(password) => {
    try {
        const saltRounds = 10; // Number of salt rounds (the higher, the more secure but slower)
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        return hashedPassword;
    } catch (error) {
        throw new Error("Error hashing password: " + error.message);
    }
};



export const appointmentIsActive = (appointmentObject) => {
    if (appointmentObject.status === "pending" || appointmentObject.status === "in-progress") {
        return true
    }
    return false
}

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Connect to database and start server
const startServer = async () => {
  try {
    await connectDB();
    console.log('MongoDB Connected Successfully');
    
    const httpServer = createServer(app);

    // Initialize Socket.IO with CORS matching allowed origins
    io = new SocketIOServer(httpServer, {
      cors: {
        origin: (origin, callback) => {
          if (!origin) return callback(null, true);
          if (allowedOrigins.includes(origin)) return callback(null, true);
          return callback(new Error('Socket origin not allowed'));
        },
        credentials: true
      }
    });

    // Auth handshake middleware
    io.use((socket, next) => {
      try {
        const token = socket.handshake.auth?.token;
        if (!token) return next(new Error('No auth token'));
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.data.userId = decoded.id;
        next();
      } catch (err) {
        console.error('Socket auth error:', err.message);
        next(new Error('Authentication failed'));
      }
    });

    io.on('connection', (socket) => {
      const userId = socket.data.userId;
      if (userId) {
        socket.join(userId);
        console.log('Socket connected user:', userId);
      }

      socket.on('disconnect', () => {
        console.log('Socket disconnected user:', userId);
      });
    });

    global._io = io; // make globally accessible for controllers

    const server = httpServer.listen(PORT, () => {
      console.log(`Server (HTTP+Socket.IO) running on port ${PORT}`);
      if (process.env.NODE_ENV === 'production') {
        console.log('Production server started at:', process.env.BACKEND_URL);
        console.log('Allowed frontend origins:', allowedOrigins.join(', '));
      } else {
        console.log('Development server started at:', `http://localhost:${PORT}`);
        console.log('Allowed frontend origins:', allowedOrigins.join(', '));
      }
    });

    // Graceful shutdown
    const shutdown = () => {
      console.log('Shutting down gracefully...');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    process.exit(1);
  }
};

startServer();