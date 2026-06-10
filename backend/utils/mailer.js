// utils/mailer.js
// ─────────────────────────────────────────────────────────────────────
// Email sender.
//
// Preferred local SMTP env vars:
//   SMTP_USER=<gmail address or SMTP username>
//   SMTP_PASS=<gmail app password or SMTP password>
//   SMTP_FROM=<optional sender address>
//
// Resend env vars:
//   RESEND_API_KEY=<your resend api key>
//   RESEND_FROM=<verified sender email, e.g. no-reply@yourdomain.com>
// ─────────────────────────────────────────────────────────────────────
'use strict';

const nodemailer = require('nodemailer');
const { Resend } = require('resend');

const getSmtpConfig = () => {
    const user = (
        process.env.SMTP_USER ||
        process.env.EMAIL_USER ||
        process.env.GMAIL_USER ||
        ''
    ).trim();
    const pass = (
        process.env.SMTP_PASS ||
        process.env.EMAIL_PASS ||
        process.env.GMAIL_APP_PASSWORD ||
        ''
    ).trim();

    if (!user || !pass) {
        return null;
    }

    return {
        user,
        pass,
        from: (process.env.SMTP_FROM || process.env.EMAIL_FROM || user).trim(),
        host: (process.env.SMTP_HOST || '').trim(),
        port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
        service: (process.env.SMTP_SERVICE || 'gmail').trim(),
    };
};

const sendWithSmtp = async (to, subject, text, html = null) => {
    const config = getSmtpConfig();
    if (!config) {
        throw new Error('[MAILER] SMTP_USER and SMTP_PASS are not set.');
    }

    const transportOptions = config.host
        ? {
            host: config.host,
            port: config.port,
            secure: config.secure,
            auth: {
                user: config.user,
                pass: config.pass,
            },
        }
        : {
            service: config.service,
            auth: {
                user: config.user,
                pass: config.pass,
            },
        };

    const transporter = nodemailer.createTransport(transportOptions);
    const info = await transporter.sendMail({
        from: `"Material App" <${config.from}>`,
        to,
        subject,
        text,
        ...(html ? { html } : {}),
    });

    return { success: true, messageId: info.messageId };
};

const sendWithResend = async (to, subject, text, html = null) => {
    const apiKey = (process.env.RESEND_API_KEY || '').trim();
    const from = (process.env.RESEND_FROM || 'onboarding@resend.dev').trim();

    if (!apiKey) {
        throw new Error('[MAILER] RESEND_API_KEY is not set in environment variables.');
    }

    if (!from) {
        throw new Error('[MAILER] RESEND_FROM is not set in environment variables.');
    }

    if (/@gmail\.com$/i.test(from)) {
        throw new Error('[MAILER] RESEND_FROM must be a Resend verified sender/domain. Gmail addresses cannot be used as Resend sender addresses.');
    }

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

    return { success: true, messageId: result.data?.id || 'resend' };
};

const sendEmail = async (to, subject, text, html = null) => {
    const useSmtp = Boolean(getSmtpConfig());
    const provider = useSmtp ? 'SMTP' : 'Resend';
    console.log(`\n[MAILER] Sending email to: ${to} via ${provider}`);

    try {
        const result = useSmtp
            ? await sendWithSmtp(to, subject, text, html)
            : await sendWithResend(to, subject, text, html);

        console.log(`[MAILER] Email sent successfully via ${provider}. Message ID: ${result.messageId || 'unknown'}`);
        return result;
    } catch (err) {
        console.error(`[MAILER] ${provider} send failed:`, err.message || err);
        throw new Error(`Failed to send email to ${to} via ${provider}: ${err.message || 'Unknown error'}`);
    }
};

module.exports = { sendEmail };
