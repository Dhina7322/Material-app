const cron = require('node-cron');
const { sendEmail } = require('./mailer');
const MaterialRequest = require('../models/MaterialRequest');

const sendReminderEmail = async (to, subject, text) => {
    try {
        await sendEmail(to, subject, text);
    } catch (mailErr) {
        console.error('[CRON] Failed to send reminder email:', mailErr.message);
    }
};

const setupCronJobs = (io) => {
    // Run every hour at the top of the hour: '0 * * * *'
    cron.schedule('0 * * * *', async () => {
        const now = new Date();
        const currentHour = now.getHours();
        
        // Reminder window: 9 AM to 6 PM
        if (currentHour >= 9 && currentHour <= 18) {
            console.log(`[CRON] Hourly reminder started at ${now.toLocaleTimeString()}`);
            
            try {
                const startOfToday = new Date();
                startOfToday.setHours(0, 0, 0, 0);

                const pendingRequests = await MaterialRequest.find({
                    status: 'PendingReturn'
                });

                for (const request of pendingRequests) {
                    try {
                        await sendReminderEmail(
                            request.employeeEmail,
                            '🔔 Material Return Reminder',
                            `Hi ${request.employeeName},\n\nThis is your hourly reminder to return the material "${request.materialName}" before 6:00 PM today. Please ensure you capture a photo when returning the material.\n\nThank you!`
                        );
                    } catch (mailErr) {
                        console.error('[MAIL] Error:', mailErr.message);
                    }

                    // 2. Send In-App Alert via Socket.io
                    if (io) {
                        io.emit('returnReminder', {
                            employeeId: request.employeeId,
                            materialName: request.materialName,
                            message: `⏰ Reminder: Please return "${request.materialName}" before 6:00 PM today.`
                        });
                    }
                }
            } catch (err) {
                console.error('[CRON] Error:', err);
            }
        }
    });

    console.log('✅ Cron jobs initialized: Hourly reminders (Mail + App) scheduled.');
};

module.exports = setupCronJobs;
