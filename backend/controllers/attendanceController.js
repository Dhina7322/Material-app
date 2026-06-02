const Attendance = require('../models/Attendance');
const User = require('../models/User');
const { sendEmail } = require('../utils/mailer');


exports.markAttendance = async (req, res) => {
    try {
        const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
        
        let attendance = await Attendance.findOne({ user: req.user.id, date: today });
        if (attendance) {
            return res.status(400).json({ msg: 'Attendance already marked for today' });
        }

        attendance = new Attendance({
            user: req.user.id,
            date: today,
            status: 'Waiting'
        });

        console.log(`[ATTENDANCE-V1] Creating new record for user ${req.user.id} on ${today}. Status set to: Waiting`);

        await attendance.save();

        const io = req.app.get('io');
        if (io) io.emit('attendanceUpdate');

        res.json(attendance);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.markAttendanceV2 = async (req, res) => {
    try {
        const { attendType, leaveType, reason, date, locationLat, locationLng } = req.body;

        if (!date) {
            return res.status(400).json({ msg: 'Date is required' });
        }

        // Check if attendance already marked for this date
        let attendance = await Attendance.findOne({ user: req.user.id, date });
        if (attendance && attendance.status !== 'Rejected') {
            return res.status(400).json({ msg: 'Attendance already marked for this date' });
        }

        let status = 'Waiting';
        if (attendType === 'Leave') {
            status = 'Pending'; // Leave requests need admin approval
        } else {
            status = 'Waiting'; // All check-ins require Admin approval
        }

        console.log(`[ATTENDANCE] Creating new record for user ${req.user.id} on ${date}. Type: ${attendType}, Status set to: ${status}`);

        const photoUrl = req.file ? `/uploads/${req.file.filename}` : null;

        const newRecord = new Attendance({
            user: req.user.id,
            date,
            type: attendType === 'Leave' ? 'Leave' : 'Present',
            leaveType: attendType === 'Leave' ? leaveType : '',
            reason: reason || '',
            status,
            locationLat: locationLat ? parseFloat(locationLat) : null,
            locationLng: locationLng ? parseFloat(locationLng) : null,
            photoUrl,
            checkInTime: new Date(),
            checkOutStatus: 'NotRequired'
        });

        await newRecord.save();
        // Send notification email to employee
        try {
          const employee = await User.findById(req.user.id);
          if (employee && employee.email) {
            const subject = `Attendance ${newRecord.status}`;
            const text = `Your attendance for ${newRecord.date} has been recorded with status: ${newRecord.status}.`;
            await sendEmail(employee.email, subject, text);
          }
        } catch (emailErr) {
          console.error('Failed to send attendance email:', emailErr);
        }

        const io = req.app.get('io');
        if (io) {
            io.emit('attendanceUpdate');
            // Notify employee's own screen
            io.emit('attendanceUpdated', { userId: req.user.id, attendance: newRecord });
            // Notify admin panel — populate user name for toast
            const populated = await newRecord.populate('user', ['name', 'employeeId', 'email']);
            io.emit('attendanceNew', { attendance: populated });
        }

        res.json(newRecord);
    } catch (err) {
        console.error('Error marking attendance v2:', err);
        res.status(500).json({ msg: 'Server error marking attendance' });
    }
};

exports.getMyAttendance = async (req, res) => {
    try {
        const attendance = await Attendance.find({ user: req.user.id }).sort({ date: -1 });
        res.json(attendance);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.getAllAttendance = async (req, res) => {
    try {
        if (req.user.role !== 'Admin') {
            return res.status(403).json({ msg: 'Access denied' });
        }
        const attendance = await Attendance.find().populate('user', ['name', 'employeeId']).sort({ date: -1 });
        res.json(attendance);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.checkoutAttendance = async (req, res) => {
    try {
        const { locationLat, locationLng } = req.body;
        const attendance = await Attendance.findById(req.params.id);

        if (!attendance) {
            return res.status(404).json({ msg: 'Attendance record not found' });
        }

        attendance.checkOutTime = new Date();
        attendance.checkOutLat = locationLat ? parseFloat(locationLat) : null;
        attendance.checkOutLng = locationLng ? parseFloat(locationLng) : null;
        attendance.checkOutStatus = 'PendingClose';

        await attendance.save();
        // Notify employee about checkout
        try {
          const employee = await User.findById(attendance.user);
          if (employee && employee.email) {
            const subject = 'Attendance Checkout Recorded';
            const text = `Your attendance for ${attendance.date} has been checked out at ${attendance.checkOutTime}.`;
            await sendEmail(employee.email, subject, text);
          }
        } catch (emailErr) {
          console.error('Failed to send checkout email:', emailErr);
        }

        const io = req.app.get('io');
        if (io) {
            io.emit('attendanceUpdate');
            io.emit('attendanceUpdated', { userId: attendance.user, attendance });
        }

        res.json(attendance);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.actionAttendance = async (req, res) => {
    try {
        if (req.user.role !== 'Admin') {
            return res.status(403).json({ msg: 'Access denied' });
        }
        const { status } = req.body;
        // 'Pending' / 'Waiting' = admin puts it on hold (moves to pending tab)
        if (!['Approved', 'Rejected', 'Pending', 'Waiting'].includes(status)) {
            return res.status(400).json({ msg: 'Invalid status' });
        }

        const attendance = await Attendance.findById(req.params.id);
        if (!attendance) {
            return res.status(404).json({ msg: 'Attendance record not found' });
        }

        attendance.status = status;
        
        // If checked-in (Present) is approved, allow them to check out later
        if (attendance.type === 'Present' && status === 'Approved') {
            attendance.checkOutStatus = 'NotRequired';
        }

        await attendance.save();

        // Send email notification to the employee on final decision
        if (status === 'Approved' || status === 'Rejected') {
            try {
                const employee = await User.findById(attendance.user);
                if (employee && employee.email) {
                    const subject = `Your Attendance Request has been ${status}`;
                    const html = `
                        <div style="font-family: Arial, sans-serif; max-width: 520px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
                            <div style="background: #1b264a; padding: 24px; text-align: center;">
                                <h2 style="color: #ffc61c; margin: 0;">Attendance Update</h2>
                            </div>
                            <div style="padding: 24px; background: #f8fafc;">
                                <p style="font-size: 16px; color: #0f172a;">Hello <strong>${employee.name}</strong>,</p>
                                <p style="font-size: 15px; color: #475569;">Your attendance request for <strong>${attendance.date}</strong> has been <strong style="color: ${status === 'Approved' ? '#10b981' : '#ef4444'}">${status}</strong> by the admin.</p>
                                ${status === 'Approved' ? '<p style="color:#10b981; font-weight:bold;">✅ Your attendance is now marked. You may proceed with your work.</p>' : '<p style="color:#ef4444;">❌ If you believe this is incorrect, please contact your admin.</p>'}
                                <hr style="border:none; border-top:1px solid #e2e8f0; margin:20px 0;">
                                <p style="font-size: 12px; color: #94a3b8;">This is an automated notification from the Attendance Management System.</p>
                            </div>
                        </div>
                    `;
                    const plainText = `Your attendance for ${attendance.date} has been ${status} by the admin.`;
                    await sendEmail(employee.email, subject, plainText, html);
                }
            } catch (emailErr) {
                console.error('Failed to send attendance action email:', emailErr);
            }
        }

        const io = req.app.get('io');
        if (io) {
            io.emit('attendanceUpdate');
            io.emit('attendanceUpdated', { userId: attendance.user, attendance });
        }

        res.json(attendance);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.closeAttendance = async (req, res) => {
    try {
        if (req.user.role !== 'Admin') {
            return res.status(403).json({ msg: 'Access denied' });
        }

        const attendance = await Attendance.findById(req.params.id);
        if (!attendance) {
            return res.status(404).json({ msg: 'Attendance record not found' });
        }

        attendance.checkOutStatus = 'ClosedApproved';
        // Notify employee about attendance closure
        try {
          const employee = await User.findById(attendance.user);
          if (employee && employee.email) {
            const subject = 'Attendance Closed and Approved';
            const text = `Your attendance for ${attendance.date} has been closed and approved.`;
            await sendEmail(employee.email, subject, text);
          }
        } catch (emailErr) {
          console.error('Failed to send closure email:', emailErr);
        }
        await attendance.save();

        const io = req.app.get('io');
        if (io) {
            io.emit('attendanceUpdate');
            io.emit('attendanceUpdated', { userId: attendance.user, attendance });
        }

        res.json(attendance);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.updateAttendanceStatus = async (req, res) => {
    try {
        if (req.user.role !== 'Admin') {
            return res.status(403).json({ msg: 'Access denied' });
        }
        const { status } = req.body;
        if (!['Approved', 'Rejected'].includes(status)) {
            return res.status(400).json({ msg: 'Invalid status' });
        }

        const attendance = await Attendance.findById(req.params.id);
        if (!attendance) {
            return res.status(404).json({ msg: 'Attendance record not found' });
        }

        attendance.status = status;
        await attendance.save();

        const io = req.app.get('io');
        if (io) io.emit('attendanceUpdate');

        res.json(attendance);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};
