const { sendEmail } = require('../utils/mailer');
const Otp = require('../models/Otp');
const crypto = require('crypto');

exports.sendOtp = async (req, res) => {
    const { email } = req.body;

    if (!email || !/\S+@\S+\.\S+/.test(email)) {
        return res.status(400).json({ msg: 'Please provide a valid email address' });
    }

    try {
        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const newOtp = new Otp({ email, otp });

        // Delete existing OTP first, THEN save the new one to prevent race conditions
        await Otp.deleteMany({ email });
        await newOtp.save();

        // Send email in background (fire-and-forget) so registration isn't blocked
        // by mailer timeouts or proxy issues. We still log errors for diagnostics.
        const sendStart = Date.now();
        sendEmail(
            email,
            'Your Verification Code',
            `Your OTP for verification is: ${otp}. This code will expire in 5 minutes.`,
            null, // html
            req.headers.origin // origin
        ).then(() => {
            const sendDuration = Date.now() - sendStart;
            console.log(`[OTP] Email sent to ${email} in ${sendDuration}ms`);
        }).catch(async (mailErr) => {
            const sendDuration = Date.now() - sendStart;
            console.error('[OTP] Async email delivery failed:', mailErr && (mailErr.message || String(mailErr)));
            console.error('[OTP] Mail error details:', {
                name: mailErr.name,
                message: mailErr.message,
                code: mailErr.code,
                responseCode: mailErr.responseCode,
                stack: mailErr.stack,
                response: mailErr.response || null
            });
            // Do NOT delete the OTP on async failure; keep it so the user can still verify if email actually arrives later.
            // Consider adding an alert or retry mechanism here.
        });

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
