import User from "../models/user.model.js";
import jwt from 'jsonwebtoken';

export const requireAuth = async (req, res, next) => {
  const token = req.cookies.jwt || req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access Denied' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      console.error('Auth Error: User not found for ID:', decoded.id);
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('JWT verify error:', err.message);
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

// Middleware to check permissions
export const checkUserPermissions = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next(); // Allow access if user is admin
  } else {
    res.status(403).json({ message: 'Forbidden' }); // Block access otherwise
  }
};
export const restrict = (roles) => {
  return (req, res, next) => {
    // Restriction logic here
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    next();
  };
};