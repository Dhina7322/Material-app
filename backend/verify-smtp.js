require('./config/env');

(async () => {
  const from =
    process.env.SMTP_FROM ||
    process.env.SMTP_USER ||
    process.env.EMAIL_FROM ||
    process.env.EMAIL_USER ||
    '';
  const to = process.argv[2] || process.env.TEST_EMAIL || from;

  if (!to) {
    console.error('Provide a test recipient: node verify-smtp.js someone@example.com');
    process.exit(1);
  }

  try {
    const { sendEmail } = require('./utils/mailer');
    const result = await sendEmail(
      to,
      'OTP Mailer Test',
      'If you receive this, the same backend mailer used by OTP is working.'
    );

    console.log('Test email sent successfully! Message ID:', result.messageId || 'unknown');
  } catch (err) {
    console.error('Failed to send test email:', err.message || err);
    process.exit(1);
  }
})();
