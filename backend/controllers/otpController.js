const { sendEmail } = require('../utils/mailer');
const Otp = require('../models/Otp');
// const crypto = require('crypto'); // Removed unused import

exports.sendOtp = async (req, res) => {
    const { email } = req.body;

    if (!email || !/\S+@\S+\.\S+/.test(email)) {
        return res.status(400).json({ msg: 'Please provide a valid email address' });
    }

    try {
        // Generate 6‑digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const newOtp = new Otp({ email, otp, attempts: 0 });

        // Ensure only one OTP per email
        await Otp.deleteMany({ email });
        await newOtp.save();

        const sendStart = Date.now();
        // Await email delivery so we can surface failures
        await sendEmail(
            email,
            'Your Verification Code',
            `Your OTP for verification is: ${otp}. This code will expire in 5 minutes.`,
            // Do NOT delete the OTP on async failure; keep it so the user can still verify if email actually arrives later.
            // Consider adding an alert or retry mechanism here.
        );

        // Return success immediately (don't expose OTP in production)
        const responsePayload = { msg: 'Verification code sent to ' + email, debugDurationMs: Date.now() - sendStart };
        if (process.env.NODE_ENV !== 'production') responsePayload.devOtp = otp;
        return res.json(responsePayload);
    } catch (err) {
        console.error('OTP Send Error:', err.message);
        res.status(500).json({ msg: 'Error processing verification' });
    }
};

exports.verifyOtp = async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ msg: 'Email and OTP are required' });
    }

    try {
        const otpRecord = await Otp.findOne({ email });

        if (!otpRecord) {
            return res.status(400).json({ msg: 'OTP expired or not found. Please request a new code.' });
        }

        // Lock after 3 failed attempts
if (otpRecord.attempts >= 3) {
            // Use deleteOne without awaiting to not delay the response
            Otp.deleteOne({ email }).catch(() => { });
            return res.status(400).json({ msg: 'Too many failed attempts. Please request a new OTP.' });
        }

        if (otpRecord.otp !== otp) {
            otpRecord.attempts += 1;
            await otpRecord.save();
            const remaining = 3 - otpRecord.attempts;
            return res.status(400).json({ msg: `Invalid OTP. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.` });
        }

        // Success — delete OTP without blocking the success response
        Otp.deleteOne({ email }).catch(() => { });
        res.json({ success: true, msg: 'OTP verified successfully' });

    } catch (err) {
        console.error('OTP Verify Error:', err.message);
        res.status(500).json({ msg: 'Server error during verification' });
    }
};
