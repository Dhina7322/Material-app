const { sendEmail } = require('../utils/mailer');
const Otp = require('../models/Otp');
// const crypto = require('crypto'); // Removed unused import

exports.sendOtp = async (req, res) => {
    let { email } = req.body;

    // Normalize email to lowercase and trim whitespace for consistency
    if (email) {
        email = email.trim().toLowerCase();
    }

    if (!email || !/\S+@\S+\.\S+/.test(email)) {
        return res.status(400).json({ msg: 'Please provide a valid email address' });
    }

    try {
        const User = require('../models/User');
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ msg: 'Email is already registered' });
        }

        if (req.body.employeeId) {
            const cleanId = req.body.employeeId.trim().toUpperCase();
            const employeeExists = await User.findOne({ employeeId: cleanId });
            if (employeeExists) {
                return res.status(400).json({ msg: 'Employee ID is already in use' });
            }
        }

        // Generate 6‑digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const newOtp = new Otp({ email, otp, attempts: 0 });

        // Ensure only one OTP per email
        await Otp.deleteMany({ email });
        await newOtp.save();

        const sendStart = Date.now();
        let emailDelivered = false;
        try {
            // Await email delivery so we can surface failures
            await sendEmail(
                email,
                'Your Verification Code',
                `Your OTP for verification is: ${otp}. This code will expire in 5 minutes.`
            );
            emailDelivered = true;
        } catch (emailErr) {
            console.error('Failed to send OTP email:', emailErr.message);
            // Keep the registration flow alive even when SMTP is unavailable.
            // If email delivery fails, return the generated OTP for the app to show
            // so the user can continue registration instead of getting a hard error.
        }

        const isDevelopment = process.env.NODE_ENV !== 'production';

        if (!emailDelivered) {
            if (isDevelopment) {
                return res.json({
                    msg: 'Verification code generated for local testing. Email delivery failed, so the OTP is also returned for debugging.',
                    devOtp: otp,
                    debugDurationMs: Date.now() - sendStart,
                });
            }

            return res.status(500).json({
                msg: 'Failed to send verification email. Please try again later.'
            });
        }

        const responsePayload = {
            msg: 'Verification code sent to ' + email,
            debugDurationMs: Date.now() - sendStart,
        };

        // Only expose the OTP in development for debugging.
        if (isDevelopment) {
            responsePayload.devOtp = otp;
        }

        return res.json(responsePayload);
    } catch (err) {
        // Log full error for debugging purposes
        console.error('OTP Send Error:', err);
        const errorMsg = err.message || 'Error processing verification';
        // Include debug details only in non‑production environments
        const errorResponse = { msg: errorMsg };
        if (process.env.NODE_ENV !== 'production') {
            errorResponse.debug = err.stack;
        }
        res.status(500).json(errorResponse);
    }

};

exports.verifyOtp = async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ msg: 'Email and OTP are required' });
    }

    try {
        // Use normalized email for lookup to avoid case mismatches
        const normalizedEmail = email.trim().toLowerCase();
        const otpRecord = await Otp.findOne({ email: normalizedEmail });

        if (!otpRecord) {
            return res.status(400).json({ msg: 'OTP expired or not found. Please request a new code.' });
        }

        // Lock after 3 failed attempts
        if (otpRecord.attempts >= 3) {
            // Use deleteOne without awaiting to not delay the response
            Otp.deleteOne({ email: normalizedEmail }).catch(() => { });
            return res.status(400).json({ msg: 'Too many failed attempts. Please request a new OTP.' });
        }

        if (otpRecord.otp !== otp) {
            otpRecord.attempts += 1;
            await otpRecord.save();
            const remaining = 3 - otpRecord.attempts;
            return res.status(400).json({ msg: `Invalid OTP. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.` });
        }

        // Success — delete OTP without blocking the success response
        Otp.deleteOne({ email: normalizedEmail }).catch(() => { });
        res.json({ success: true, msg: 'OTP verified successfully' });

    } catch (err) {
        console.error('OTP Verify Error:', err.message);
        res.status(500).json({ msg: 'Server error during verification' });
    }
};
// Duplicated block removed
