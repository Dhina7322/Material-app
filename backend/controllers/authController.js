const User = require('../models/User');
const Otp = require('../models/Otp');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_123';

exports.register = async (req, res) => {
    const { name, employeeId, email, password, role, otp } = req.body;
    try {
        // ---- Normalise inputs ----
        const cleanEmail = email ? email.trim().toLowerCase() : '';
        const cleanId = (employeeId && employeeId.trim() !== '') ? employeeId.trim().toUpperCase() : undefined;
        const cleanOtp = otp ? otp.trim() : '';

        // ---- Basic validation ----
        if (!cleanEmail || !cleanOtp) {
            return res.status(400).json({ msg: 'Email and OTP are required for registration' });
        }

        // ---- Verify OTP ----
        const otpRecord = await Otp.findOne({ email: cleanEmail });
        if (!otpRecord) {
            return res.status(400).json({ msg: 'OTP expired or not found. Please request a new code.' });
        }
        if (otpRecord.attempts >= 3) {
            await Otp.deleteOne({ email: cleanEmail });
            return res.status(400).json({ msg: 'Too many failed attempts. Please request a new OTP.' });
        }
        if (otpRecord.otp !== cleanOtp) {
            otpRecord.attempts += 1;
            await otpRecord.save();
            const remaining = 3 - otpRecord.attempts;
            return res.status(400).json({ msg: `Invalid OTP. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.` });
        }
        // OTP correct – remove it so it cannot be reused
        await Otp.deleteOne({ email: cleanEmail });

        // ---- Check for existing users ----
        let existingEmailUser = await User.findOne({ email: cleanEmail });
        if (existingEmailUser) {
            return res.status(400).json({ msg: 'Email is already registered' });
        }
        if (cleanId) {
            let existingIdUser = await User.findOne({ employeeId: cleanId });
            if (existingIdUser) {
                return res.status(400).json({ msg: 'Employee ID is already in use' });
            }
        }

        // ---- Create the new user ----
        const user = new User({
            name,
            employeeId: cleanId,
            email: cleanEmail,
            password,
            role,
        });
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);
        await user.save();

        // ---- Issue JWT ----
        const payload = { user: { id: user.id, role: user.role } };
        jwt.sign(payload, JWT_SECRET, { expiresIn: 360000 }, (err, token) => {
            if (err) throw err;
            res.json({
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    employeeId: user.employeeId,
                    email: user.email,
                    role: user.role,
                },
            });
        });
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).send('Server error');
    }
};

exports.login = async (req, res) => {
    const { email, password, captcha } = req.body;
    if (!captcha) return res.status(400).json({ msg: 'CAPTCHA required' });
    
    try {
        const cleanEmail = email ? email.trim().toLowerCase() : '';
        let user = await User.findOne({ email: cleanEmail });
        if (!user) return res.status(400).json({ msg: 'Invalid Credentials' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ msg: 'Invalid Credentials' });

        const payload = { user: { id: user.id, role: user.role } };
        jwt.sign(payload, JWT_SECRET, { expiresIn: 360000 }, (err, token) => {
            if (err) throw err;
            res.json({ 
                token, 
                user: { 
                    id: user.id, 
                    name: user.name, 
                    employeeId: user.employeeId,
                    email: user.email,
                    role: user.role 
                } 
            });
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

exports.getUser = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        res.json(user);
    } catch (err) {
        res.status(500).send('Server Error');
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const { name, employeeId, email } = req.body;
        const user = await User.findById(req.user.id);
        
        if (!user) return res.status(404).json({ msg: 'User not found' });

        if (name) user.name = name;
        if (employeeId && user.role === 'Employee') user.employeeId = employeeId;
        
        if (req.body.removePhoto === 'true') {
            user.profilePicture = '';
        } else if (req.file) {
            user.profilePicture = req.file.path.replace(/\\/g, '/');
        }

        // If email is changing, we just return that it needs verification
        // The actual update happens after OTP verification
        let emailChanged = false;
        if (email && email.toLowerCase() !== user.email) {
            emailChanged = true;
            // Check if new email is already taken
            const existingUser = await User.findOne({ email: email.toLowerCase() });
            if (existingUser) return res.status(400).json({ msg: 'Email already in use' });
        }

        await user.save();

        res.json({ 
            user: {
                id: user.id,
                name: user.name,
                employeeId: user.employeeId,
                email: user.email,
                role: user.role,
                profilePicture: user.profilePicture
            },
            emailChanged 
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.finalizeEmailUpdate = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ msg: 'User not found' });

        user.email = email.toLowerCase();
        await user.save();

        res.json({ msg: 'Email updated successfully', email: user.email });
    } catch (err) {
        res.status(500).send('Server Error');
    }
};

exports.getHighPenaltyUsers = async (req, res) => {
    try {
        const User = require('../models/User');
        const MaterialRequest = require('../models/MaterialRequest');
        
        // Fetch users with at least 1 penalty, sorted by the highest score first
        const users = await User.find({ penaltyScore: { $gt: 0 } }).select('-password').sort({ penaltyScore: -1 });
        
        const usersWithRequests = await Promise.all(users.map(async (user) => {
            const requests = await MaterialRequest.find({ 
                user: user._id, 
                status: 'Penalized' 
            }).sort({ penaltyIssuedAt: -1 });
            
            return {
                ...user.toObject(),
                penalizedRequests: requests
            };
        }));

        res.json(usersWithRequests);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};
