require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const nodemailer = require('nodemailer');

(async () => {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  if (!user || !pass) {
    console.error('EMAIL_USER or EMAIL_PASS not set in .env');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
    // Render blocks SMTP ports; this script is for local verification only.
  });

  const mailOptions = {
    from: `"SMTP Test" <${user}>`,
    to: user,
    subject: 'SMTP Credential Test',
    text: 'If you receive this, your SMTP credentials are valid.',
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Test email sent successfully! MessageId:', info.messageId);
  } catch (err) {
    console.error('❌ Failed to send test email:', err.message);
  }
})();
