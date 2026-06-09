require('dotenv').config({ path: require('path').join(__dirname, '.env') });

(async () => {
  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  const from = (process.env.RESEND_FROM || '').trim();

  if (!apiKey || !from) {
    console.error('RESEND_API_KEY or RESEND_FROM not set in .env');
    process.exit(1);
  }

  try {
    const { Resend } = require('resend');
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from,
      to: [from],
      subject: 'Resend API Test',
      text: 'If you receive this, your Resend API key and sender address are working.',
    });

    if (result.error) {
      throw new Error(result.error.message || 'Resend returned an error');
    }

    console.log('✅ Test email sent successfully! Message ID:', result.data?.id || 'unknown');
  } catch (err) {
    console.error('❌ Failed to send test email:', err.message || err);
  }
})();
