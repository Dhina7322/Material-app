// utils/mailer.js
// ─────────────────────────────────────────────────────────────────────
//  Pure Nodemailer email sender – no external APIs, no proxy.
//
//  Tries Gmail SMTP with two port configurations in sequence:
//    1. Port 587 + STARTTLS  (works on Render and most hosting)
//    2. Port 465 + SSL       (fallback for environments that prefer SSL)
//
//  Required env vars:
//    EMAIL_USER=managemadhura123@gmail.com
//    EMAIL_PASS=<16-char Gmail App Password with spaces removed>
// ─────────────────────────────────────────────────────────────────────
'use strict';

const nodemailer = require('nodemailer');

/**
 * Try sending via a specific port/secure combination.
 * Returns the nodemailer `info` object on success, throws on failure.
 */
async function attemptSend(to, subject, text, html, port, secure) {
    console.log(`[MAILER] Trying Gmail SMTP → port ${port} (secure=${secure})…`);

    const emailUser = (process.env.EMAIL_USER || '').trim();
    const emailPass = (process.env.EMAIL_PASS || '').replace(/\s+/g, '');

    if (!emailUser || !emailPass) {
        throw new Error('[MAILER] EMAIL_USER and EMAIL_PASS must be set in the environment.');
    }

    const transporter = nodemailer.createTransport({
        host   : 'smtp.gmail.com',
        port,
        secure,                          // true = SSL on 465, false = STARTTLS on 587
        auth   : {
            user : emailUser,
            pass : emailPass,
        },
        connectionTimeout : 20000,       // 20 s – generous for cold Render starts
        greetingTimeout   : 10000,
        socketTimeout     : 20000,
        tls: {
            rejectUnauthorized : false,  // avoids cert-chain issues on some hosts
        },
    });

    // verify() throws immediately if credentials are wrong or host unreachable
    await transporter.verify();
    console.log(`[MAILER] transporter.verify() passed on port ${port} ✔`);

    const info = await transporter.sendMail({
        from    : `"Madhura Energy" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        text,
        ...(html ? { html } : {}),
    });

    console.log(`✅ [MAILER] Email sent via port ${port} – MessageId: ${info.messageId}`);
    return info;
}

/**
 * sendEmail(to, subject, text, html?)
 *
 * Sends an email using Gmail SMTP.
 * Tries port 587 first (STARTTLS), falls back to port 465 (SSL).
 *
 * Returns { success: true, messageId: '…' }
 * Throws with a descriptive message when both attempts fail.
 */
const sendEmail = async (to, subject, text, html = null) => {
    console.log(`\n[MAILER] ──── Sending email to: ${to} ────`);

    // ── Env-var sanity check ─────────────────────────────────────────
    const emailUser = (process.env.EMAIL_USER || '').trim();
    const emailPass = (process.env.EMAIL_PASS || '').replace(/\s+/g, '');

    if (!emailUser) {
        throw new Error('[MAILER] EMAIL_USER is not set in environment variables.');
    }
    if (!emailPass) {
        throw new Error('[MAILER] EMAIL_PASS is not set in environment variables.');
    }
    console.log(`[MAILER] Using account: ${emailUser}`);

    // ── Attempt 1: port 587, STARTTLS ────────────────────────────────
    try {
        const info = await attemptSend(to, subject, text, html, 587, false);
        return { success: true, messageId: info.messageId };
    } catch (err587) {
        console.error(`❌ [MAILER] Port 587 failed: ${err587.message}`);
    }

    // ── Attempt 2: port 465, SSL ──────────────────────────────────────
    try {
        const info = await attemptSend(to, subject, text, html, 465, true);
        return { success: true, messageId: info.messageId };
    } catch (err465) {
        console.error(`❌ [MAILER] Port 465 failed: ${err465.message}`);
    }

    // ── Both failed ───────────────────────────────────────────────────
    throw new Error(
        `Failed to send email to ${to}. ` +
        `Both Gmail SMTP ports (587, 465) are unreachable. ` +
        `Verify EMAIL_USER and EMAIL_PASS are set in your hosting environment, ` +
        `ensure you are using a Gmail App Password (not your regular password), ` +
        `and confirm outbound SMTP is allowed.`
    );
};

module.exports = { sendEmail };