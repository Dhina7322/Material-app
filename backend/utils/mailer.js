// utils/mailer.js
const nodemailer = require('nodemailer');
const dns = require('dns').promises;
const https = require('https');

const httpsPost = (url, data) => {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const postData = JSON.stringify(data);

        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(body));
                    } catch (e) {
                        resolve({ success: true, raw: body });
                    }
                } else {
                    // Include response details on the Error object so callers can inspect status/headers/body
                    const err = new Error(`Status Code: ${res.statusCode}, Body: ${body}`);
                    err.response = {
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: body
                    };
                    reject(err);
                }
            });
        });

        req.on('error', (err) => {
            reject(err);
        });

        req.write(postData);
        req.end();
    });
};

// Send using SendGrid API (preferred for serverless environments)
const sendWithSendGrid = (to, subject, text, html = null) => {
  return new Promise((resolve, reject) => {
    const payload = {
      personalizations: [{ to: [{ email: to }] }],
      from: { email: process.env.SENDGRID_FROM || process.env.EMAIL_USER },
      subject,
      content: [{ type: 'text/plain', value: text }]
    };
    if (html) payload.content = [{ type: 'text/html', value: html }];

    const postData = JSON.stringify(payload);
    const options = {
      hostname: 'api.sendgrid.com',
      path: '/v3/mail/send',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log('[MAILER] SendGrid SUCCESS');
          resolve({ success: true, raw: body });
        } else {
          const err = new Error(`SendGrid ${res.statusCode}: ${body}`);
          err.response = { statusCode: res.statusCode, headers: res.headers, body };
          console.error('[MAILER] SendGrid FAILED →', err.message);
          reject(err);
        }
      });
    });
    req.on('error', (e) => {
      console.error('[MAILER] SendGrid request error →', e.message);
      reject(e);
    });
    req.write(postData);
    req.end();
  });
};

const sendEmail = async (to, subject, text, html = null, origin = null) => {
    console.log(`[MAILER] Attempting to send email to: ${to}`);

    // ──── STRATEGY 1: Direct SMTP via Gmail ────
    try {
        console.log(`[MAILER] Trying direct SMTP send to: ${to}`);

        // Resolve smtp.gmail.com to IPv4 to bypass IPv6 connection issues (ENETUNREACH)
        let host = 'smtp.gmail.com';
        try {
            const addresses = await dns.resolve4('smtp.gmail.com');
            if (addresses && addresses.length > 0) {
                host = addresses[0];
                console.log(`[MAILER] Resolved smtp.gmail.com to IPv4 address: ${host}`);
            }
        } catch (dnsError) {
            console.error('[MAILER] DNS resolution failed, using default hostname:', dnsError.message);
        }

        const transporter = nodemailer.createTransport({
            host: host,
            port: 465,
            secure: true,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
            connectionTimeout: 15000,
            socketTimeout: 15000,
            tls: {
                servername: 'smtp.gmail.com',
                rejectUnauthorized: false
            },
        });

        const mailOptions = {
            from: `"Madhura Energy" <${process.env.EMAIL_USER}>`,
            to: to,
            subject: subject,
            text: text,
            ...(html ? { html } : {}),
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ [MAILER] SUCCESS (SMTP) - Email sent to ${to} | MessageId: ${info.messageId}`);
        return { success: true, messageId: info.messageId };

    } catch (smtpError) {
        console.error('❌ [MAILER] Direct SMTP failed:', smtpError.message);
        // Fall through to next strategy
    }

    // ──── STRATEGY 2: SendGrid API ────
    if (process.env.SENDGRID_API_KEY) {
        console.log('[MAILER] Trying SendGrid API...');
        try {
            const res = await sendWithSendGrid(to, subject, text, html);
            console.log(`✅ [MAILER] SUCCESS (SendGrid) - Email sent to ${to}`);
            return res;
        } catch (sgErr) {
            console.error('❌ [MAILER] SendGrid failed:', sgErr.message);
        }
    }

    // ──── STRATEGY 3: HTTP Proxy ────
    let proxyUrl = '';
    if (process.env.EMAIL_PROXY_URL) {
        // Use the configured proxy URL directly – it already points to the Vercel function
        proxyUrl = process.env.EMAIL_PROXY_URL;
    } else if (origin && !origin.includes('localhost') && !origin.includes('192.168') && !origin.includes('127.0.0.1') && !origin.includes('10.0.2.2')) {
        proxyUrl = `${origin}/api/send-email`;
    } else {
        const defaultVercel = process.env.DEFAULT_VERCEL_URL || 'https://material-request-app.vercel.app';
        proxyUrl = `${defaultVercel.replace(/\/*$/, '')}/api/send-email`;
    }

    if (proxyUrl) {
        console.log(`[MAILER] Trying proxy at: ${proxyUrl}`);
        try {
            const result = await httpsPost(proxyUrl, {
                to, subject, text, html,
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            });
            console.log(`✅ [MAILER] SUCCESS (Proxy) - Email sent via proxy to ${to}`);
            return result;
        } catch (proxyError) {
            console.error('❌ [MAILER] Proxy failed:', proxyError.message);
        }
    }

    // All strategies failed
    throw new Error(`All email delivery methods failed for ${to}. Check SMTP credentials, SendGrid key, or proxy URL.`);
};

module.exports = { sendEmail };