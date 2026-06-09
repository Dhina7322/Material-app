// utils/mailer.js
// ─────────────────────────────────────────────────────────────────────
// Resend-based email sender.
//
// Required env vars:
//   RESEND_API_KEY=<your resend api key>
//   RESEND_FROM=<verified sender email, e.g. no-reply@yourdomain.com>
// ─────────────────────────────────────────────────────────────────────
'use strict';

const { Resend } = require('resend');

const sendEmail = async (to, subject, text, html = null) => {
    console.log(`\n[MAILER] ──── Sending email to: ${to} via Resend ────`);

    const apiKey = (process.env.RESEND_API_KEY || '').trim();
    const from = (process.env.RESEND_FROM || 'managemadhura123@gmail.com').trim();

    if (!apiKey) {
        throw new Error('[MAILER] RESEND_API_KEY is not set in environment variables.');
    }

    try {
        const resend = new Resend(apiKey);
        const result = await resend.emails.send({
            from,
            to: [to],
            subject,
            text,
            ...(html ? { html } : {}),
        });

        if (result.error) {
            throw new Error(result.error.message || 'Resend returned an error.');
        }

        console.log(`[MAILER] Email sent successfully via Resend. Message ID: ${result.data?.id || 'unknown'}`);
        return { success: true, messageId: result.data?.id || 'resend' };
    } catch (err) {
        console.error('[MAILER] Resend send failed:', err.message || err);
        throw new Error(`Failed to send email to ${to} via Resend: ${err.message || 'Unknown error'}`);
    }
};

module.exports = { sendEmail };