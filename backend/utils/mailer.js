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

const sendEmail = async (to, subject, text, html = null, origin = null) => {
    // Render Free Tier blocks SMTP ports 465, 587, 25.
    // Dynamically construct the proxy URL based on the request's origin (Vercel deployment URL)
    let emailProxyUrl = process.env.EMAIL_PROXY_URL;
    
    // Only use proxy in production environments
    const isProd = process.env.NODE_ENV === 'production';
    const isLocal = origin && (origin.includes('localhost') || origin.includes('192.168') || origin.includes('127.0.0.1'));
    
    // Always use the main production Vercel URL for the proxy to avoid 
    // Vercel Preview Authentication (401) errors on preview deployments.
    if (!emailProxyUrl && !isLocal && isProd) {
        emailProxyUrl = 'https://materialappmanager.vercel.app/api/send-email';
    }
    
    if (!isProd) {
        emailProxyUrl = null; // Force disable proxy locally
    }
    
    if (emailProxyUrl) {
        console.log(`[MAILER] Render Free Tier: routing email request via proxy to: ${emailProxyUrl}`);
        try {
            const result = await httpsPost(emailProxyUrl, {
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
            // Throw the proxy error directly to let the user see the exact error on the frontend UI
            throw new Error(`Proxy email delivery failed: ${proxyError.message}`);
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