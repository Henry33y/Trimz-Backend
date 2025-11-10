import { Router } from "express";
import jwt from 'jsonwebtoken'
import passport from "passport";
import { forgotPasswordController, login, logout, resetPasswordController } from "../controllers/auth.controller.js";
import dotenv from 'dotenv'
import { getFrontendBase } from '../config/frontendUrl.js'

dotenv.config()

const frontend_URL = process.env.FRONTEND_URL
const loginRouter = Router()

//Login and logout routes
loginRouter.post("/login", login)
loginRouter.get("/logout", logout)
loginRouter.post("/auth/forgot-password", forgotPasswordController)
loginRouter.post("/auth/reset-password/:token", resetPasswordController)
// Google OAuth2 login
loginRouter.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'], prompt: 'select_account consent' }));
// Google OAuth2 callback
loginRouter.get(
  '/auth/google/callback',
  passport.authenticate('google', { failureRedirect: `${frontend_URL}`, session: false }),
  (req, res) => {
    const { token } = req.user;
    const { role } = req.user.user;
    res.cookie('jwt', token, { httpOnly: true });
    console.log('OAuth user:', req.user);

    // Resolve frontend base via helper
    const frontendBase = getFrontendBase().replace(/\/+$/, '');
    console.log('Frontend base resolved to:', frontendBase);

    // Use a hash-fragment route so the static host doesn't 404 on refresh
    const targetPath = role === 'customer' ? 'users/profile/me' : 'barbers/profile/me';
    const redirectUrl = `${frontendBase}/#/${targetPath}?token=${encodeURIComponent(token)}&method=googleoauth`;
    console.log('Redirecting to:', redirectUrl);
    res.redirect(redirectUrl);
  }
);

export default loginRouter