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
    // Render Free Tier blocks SMTP ports 465, 587, 25.
    // Dynamically construct the proxy URL based on the request's origin (Vercel deployment URL)
    
    // Only use proxy in production environments (Render blocks port 465/587) unless EMAIL_PROXY_URL is explicitly set
    const isProd = process.env.NODE_ENV === 'production';
    const isLocal = origin && (origin.includes('localhost') || origin.includes('192.168') || origin.includes('127.0.0.1') || origin.includes('10.0.2.2'));
    
    let proxyUrl = '';
    const shouldUseProxy = (isProd && !isLocal) || process.env.EMAIL_PROXY_URL;
    
    if (shouldUseProxy) {
      // Prefer the request's origin header (works in web / Expo dev)
      if (origin) {
        // If the origin looks like a Vercel preview deployment, use it directly
        // Example: https://material-8vmx45r2u-arou-s-projects.vercel.app
        proxyUrl = `${origin}/api/send-email`;
      } else if (process.env.EMAIL_PROXY_URL) {
        // Fallback to configured env var – ensure it ends with the API path
        proxyUrl = process.env.EMAIL_PROXY_URL.replace(/\/*$/,'') + '/api/send-email';
      }
      // If still empty, default to the production Vercel URL (hard‑coded)
      if (!proxyUrl) {
        const defaultVercel = process.env.DEFAULT_VERCEL_URL || 'https://material-request-app.vercel.app';
        proxyUrl = `${defaultVercel.replace(/\/*$/,'')}/api/send-email`;
      }
    }
    
    // If SendGrid API key is present, prefer sending directly via SendGrid (works in serverless)
    if (process.env.SENDGRID_API_KEY) {
        console.log('[MAILER] Using SendGrid API to send email');
        try {
            const res = await sendWithSendGrid(to, subject, text, html);
            console.log(`✅ [MAILER] SUCCESS (SendGrid) - Email sent via SendGrid to ${to}`);
            return res;
        } catch (sgErr) {
            console.error('[MAILER] SendGrid send failed:', sgErr.message || sgErr);
            // fallthrough to proxy or direct SMTP as a fallback
        }
    }
    
    if (proxyUrl) {
        console.log(`[MAILER] Routing email request via proxy to: ${proxyUrl}`);
        try {
            const result = await httpsPost(proxyUrl, {
                to,
                subject,
                text,
                html,
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            });
            console.log(`✅ [MAILER] SUCCESS (Proxy) - Email sent via proxy to ${to}`);
            return result;
        } catch (proxyError) {
            console.error('❌ [MAILER] Proxy Email Send Failed:', proxyError.message);
            // If proxy returned a 405, give a helpful hint in the error message
            let hint = '';
            if (proxyError.response && proxyError.response.statusCode === 405) {
                hint = ' (Proxy returned 405 Method Not Allowed - ensure the proxy supports POST at the configured path and accepts JSON payloads)';
            }
            const err = new Error(`Proxy email delivery failed: ${proxyError.message}${hint}`);
            // attach response if present so callers can surface status/body
            if (proxyError.response) err.response = proxyError.response;
            throw err;
        }
    }

    try {
        console.log(`[MAILER] Trying direct SMTP send to: ${to}`);

        // Resolve smtp.gmail.com to IPv4 to bypass Vercel/Render IPv6 connection issues (ENETUNREACH)
        let host = 'smtp.gmail.com';
        try {
            const addresses = await dns.resolve4('smtp.gmail.com');
            if (addresses && addresses.length > 0) {
                host = addresses[0];
                console.log(`[MAILER] Resolved smtp.gmail.com to IPv4 address: ${host}`);
            }
        } catch (dnsError) {
            console.error('[MAILER] DNS resolution for smtp.gmail.com failed, using default hostname:', dnsError.message);
        }

        function createTransporter() {
            // Force port 465 and secure: true for Gmail to avoid STARTTLS timeouts on Render
            return nodemailer.createTransport({
                host: host,
                port: 465,
                secure: true,
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS,
                },
                connectionTimeout: 30000,
                socketTimeout: 30000,
                tls: {
                    servername: 'smtp.gmail.com',
                    rejectUnauthorized: false
                },
            });
        }

        const transporter = createTransporter();
        // Verify connection configuration at startup – helps surface auth issues early
        if (process.env.NODE_ENV === 'development') {
            transporter.verify(function (error, success) {
                if (error) {
                    console.error('[MAILER] Verification failed:', error);
                } else {
                    console.log('[MAILER] Server is ready to take messages');
                }
            });
        }

        const mailOptions = {
            from: `"Madhura Energy" <${process.env.EMAIL_USER}>`,
            to: to,
            subject: subject,
            text: text,
            ...(html ? { html } : {}),
        };

        const info = await transporter.sendMail(mailOptions);

        console.log(`✅ [MAILER] SUCCESS - Email sent to ${to} | MessageId: ${info.messageId}`);
        return { success: true, messageId: info.messageId };

    } catch (error) {
        console.error('❌ [MAILER] FAILED to send email:');
        console.error('Code:', error.code);
        console.error('Message:', error.message);
        console.error('Full Error:', error);
        
        throw error; // Let controller handle it
    }
};

module.exports = { sendEmail };