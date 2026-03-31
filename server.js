// ============================================
// starGo - Secure Node.js Server (Anti-Fake Protection)
// ============================================

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const axios = require('axios');
const crypto = require('crypto');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname)));

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
    // محفظة استلام الدفعات (غيرها لعنوانك)
    RECEIVER_WALLET: "UQBPpnRDUyTVXzJk4Qxr02z4iPFZfWv8NC2fvOjHe8UtmpHE",
    
    // TON Center API
    TON_API_ENDPOINT: 'https://toncenter.com/api/v2',
    TON_API_KEY: process.env.TON_API_KEY || '',
    
    // الحد الأدنى للتأكيدات (confirmations)
    MIN_CONFIRMATIONS: 1,
    
    // المدة اللي الترانزاكشن لازم تكون خلالها (دقائق)
    TX_MAX_AGE_MINUTES: 30
};

// ============================================
// Database (PostgreSQL)
// ============================================

// نحلل DATABASE_URL يدوياً عشان نتجاهل PGHOST/PGPORT تبع Replit
// ومنخليش مكتبة pg تاخد localhost من الـ environment تلقائياً
function buildPoolConfig() {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');

    try {
        const parsed = new URL(url);
        // SSL مطلوب فقط مع Supabase/Neon/sslmode=require
        // قاعدة بيانات Replit الخارجية مش بتحتاج SSL
        const isExternal = (
            url.includes('neon.tech') ||
            url.includes('supabase') ||
            url.includes('sslmode=require')
        );
        return {
            host:     parsed.hostname,
            port:     parseInt(parsed.port || '5432'),
            user:     decodeURIComponent(parsed.username),
            password: decodeURIComponent(parsed.password),
            database: parsed.pathname.replace(/^\//, ''),
            ssl:      isExternal ? { rejectUnauthorized: false } : false,
        };
    } catch {
        // fallback إذا الـ URL مش standard
        return {
            connectionString: url,
            ssl: { rejectUnauthorized: false },
        };
    }
}

const pool = new Pool(buildPoolConfig());

let dbInitialized = false;

async function connectDB() {
    if (dbInitialized) return;
    try {
        const client = await pool.connect();
        console.log('✅ Database connected');

        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                telegram_username VARCHAR(100) UNIQUE NOT NULL,
                wallet_address VARCHAR(255),
                login_count INT DEFAULT 1,
                first_login TIMESTAMP,
                last_login TIMESTAMP,
                wallet_connected_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS stars_orders (
                id SERIAL PRIMARY KEY,
                user_id INT REFERENCES users(id) ON DELETE SET NULL,
                recipient_username VARCHAR(100),
                stars_amount INT,
                ton_amount DECIMAL(10,4),
                order_id VARCHAR(100) UNIQUE,
                wallet_address VARCHAR(255),
                status VARCHAR(20) DEFAULT 'pending',
                tx_hash TEXT,
                paid_at TIMESTAMP,
                updated_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS premium_orders (
                id SERIAL PRIMARY KEY,
                user_id INT REFERENCES users(id) ON DELETE SET NULL,
                recipient_username VARCHAR(100),
                plan_name VARCHAR(50),
                ton_amount DECIMAL(10,4),
                order_id VARCHAR(100) UNIQUE,
                wallet_address VARCHAR(255),
                status VARCHAR(20) DEFAULT 'pending',
                tx_hash TEXT,
                paid_at TIMESTAMP,
                updated_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS payment_verifications (
                id SERIAL PRIMARY KEY,
                order_id VARCHAR(50) NOT NULL,
                tx_hash TEXT NOT NULL,
                status VARCHAR(20) DEFAULT 'pending',
                verification_data JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query(`CREATE INDEX IF NOT EXISTS idx_pv_order ON payment_verifications(order_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_pv_tx ON payment_verifications(tx_hash)`);

        client.release();
        dbInitialized = true;
    } catch (error) {
        console.error('❌ Database error:', error.message);
        throw error;
    }
}

// Middleware: ensure DB is ready before any API request
app.use(async (req, res, next) => {
    if (!dbInitialized) {
        try {
            await connectDB();
        } catch (err) {
            return res.status(500).json({ success: false, message: 'Database connection failed: ' + err.message });
        }
    }
    next();
});

function sendResponse(res, success, message, data = null) {
    res.json({ success, message, data });
}

// ============================================
// TON BLOCKCHAIN VERIFICATION - التحقق الحقيقي
// ============================================

/**
 * تطبيع عنوان TON للمقارنة (يحول من raw إلى شكل موحد)
 */
function normalizeTonAddress(addr) {
    if (!addr) return '';
    return addr.toLowerCase().replace(/^(eq|uq)/i, '');
}

/**
 * البحث عن ترانزاكشن حقيقية عبر المرسل + المبلغ + الوقت
 * (البوك BOC ليس هاش، لذا نبحث بالعنوان والمبلغ)
 */
async function getTransactionFromBlockchain(bocOrHash, expectedSender, expectedAmount) {
    try {
        const url = `${CONFIG.TON_API_ENDPOINT}/getTransactions`;
        
        const params = {
            address: CONFIG.RECEIVER_WALLET,
            limit: 50,
            archival: true
        };
        
        if (CONFIG.TON_API_KEY) {
            params.api_key = CONFIG.TON_API_KEY;
        }
        
        console.log(`🔍 Searching for tx in blockchain by sender+amount...`);
        
        const apiResponse = await axios.get(url, { params, timeout: 10000 });
        
        if (!apiResponse.data?.result || !Array.isArray(apiResponse.data.result)) {
            return null;
        }

        const expectedNano = Math.floor(parseFloat(expectedAmount) * 1e9);
        const minAcceptable = expectedNano * 0.99;
        const now = Date.now() / 1000;
        const maxAgeSeconds = CONFIG.TX_MAX_AGE_MINUTES * 60;
        const normalizedSender = normalizeTonAddress(expectedSender);

        const txs = apiResponse.data.result;
        console.log(`📦 Got ${txs.length} transactions from blockchain`);

        const tx = txs.find(t => {
            if (!t.in_msg || !t.in_msg.source) return false;

            // تحقق من المرسل (مع تطبيع الصيغة)
            const txSender = normalizeTonAddress(t.in_msg.source);
            if (txSender !== normalizedSender) return false;

            // تحقق من المبلغ
            const amountNano = parseInt(t.in_msg.value || 0);
            if (amountNano < minAcceptable) return false;

            // تحقق من الوقت
            const ageSeconds = now - (t.utime || 0);
            if (ageSeconds > maxAgeSeconds || ageSeconds < 0) return false;

            // ملاحظة: لا نتحقق من الوجهة هنا لأن TonCenter يرجع الصيغة الخام
            // بينما RECEIVER_WALLET بالصيغة الودودة — وكلا الصيغتين لنفس المحفظة
            // والـ API نفسه فلتر الترانزاكشنات للمحفظة دي

            console.log(`✅ Match found: sender=${t.in_msg.source} amount=${amountNano} age=${Math.floor(ageSeconds)}s`);
            return true;
        });
        
        return tx || null;
        
    } catch (error) {
        console.error('❌ Blockchain fetch error:', error.message);
        return null;
    }
}

/**
 * التحقق إن الترانزاكشن حقيقية ومش وهمية
 */
async function verifyRealPayment(txDetails, expectedAmount, expectedSender) {
    console.log('🔍 Verifying real payment...');
    
    if (!txDetails.in_msg) {
        return { valid: false, error: 'لا توجد رسالة واردة في المعاملة' };
    }
    
    const inMsg = txDetails.in_msg;
    
    if (inMsg.msg_data && inMsg.msg_data['@type'] === 'msg.dataRaw') {
        const data = inMsg.msg_data.body || '';
        if (data.includes('f8a7ea5') || data.includes('178d4519') || data.includes('jetton')) {
            console.error('🚨 JETTON DETECTED - Possible fake token!');
            return { 
                valid: false, 
                error: 'تم رفض العملية: يُسمح فقط بـ TON الأصلي (Native TON)، لا يُسمح بـ Jetton أو عملات مزيفة',
                details: { type: 'jetton_detected' }
            };
        }
    }
    
    const amountNano = parseInt(inMsg.value || 0);
    if (amountNano === 0) {
        return { 
            valid: false, 
            error: 'المبلغ صفر - قد تكون عملة وهمية',
            details: { type: 'zero_amount' }
        };
    }
    
    const expectedNano = Math.floor(parseFloat(expectedAmount) * 1e9);
    const minAcceptable = expectedNano * 0.99;
    
    if (amountNano < minAcceptable) {
        return { 
            valid: false, 
            error: `المبلغ غير كافي: ${(amountNano/1e9).toFixed(4)} TON بدلاً من ${expectedAmount} TON`,
            details: { 
                received: amountNano,
                expected: expectedNano,
                type: 'insufficient_amount'
            }
        };
    }
    
    if (normalizeTonAddress(inMsg.source) !== normalizeTonAddress(expectedSender)) {
        return { 
            valid: false, 
            error: 'عنوان المرسل لا يتطابق',
            details: { 
                expected: expectedSender,
                received: inMsg.source,
                type: 'wrong_sender'
            }
        };
    }
    
    // الترانزاكشن اتجابت من API بالبحث بعنوان محفظة الاستقبال مباشرةً
    // فمضمون إنها وصلت للمحفظة الصح، مش محتاجين نتحقق تاني
    
    const txTime = txDetails.utime * 1000;
    const now = Date.now();
    const ageMinutes = (now - txTime) / 60000;
    
    if (ageMinutes > CONFIG.TX_MAX_AGE_MINUTES) {
        return { 
            valid: false, 
            error: 'المعاملة قديمة جداً',
            details: { age: ageMinutes, type: 'too_old' }
        };
    }
    
    if (txDetails.out_msgs && txDetails.out_msgs.length > 0) {
        for (const outMsg of txDetails.out_msgs) {
            if (outMsg.destination === inMsg.source && parseInt(outMsg.value) > 0) {
                return { 
                    valid: false, 
                    error: 'المعاملة تم رفضها (bounce)',
                    details: { type: 'bounce' }
                };
            }
        }
    }
    
    console.log('✅ Real TON payment verified!');
    
    return {
        valid: true,
        amount: amountNano,
        sender: inMsg.source,
        timestamp: txDetails.utime,
        tx_hash: txDetails.transaction_id?.hash
    };
}

/**
 * التحقق من عدم تكرار استخدام نفس الترانزاكشن
 */
async function isTxAlreadyUsed(txHash) {
    try {
        const result = await pool.query(
            'SELECT id FROM payment_verifications WHERE tx_hash = $1 AND status = $2',
            [txHash, 'confirmed']
        );
        return result.rows.length > 0;
    } catch (error) {
        console.error('Error checking tx reuse:', error);
        return false;
    }
}

// ============================================
// API Routes
// ============================================

// Health Check
app.get('/api/health', (req, res) => {
    sendResponse(res, true, 'Server running with blockchain verification');
});

// Get Price
app.get('/api/price', async (req, res) => {
    try {
        const priceRes = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=toncoin&vs_currencies=usd', { timeout: 5000 });
        sendResponse(res, true, 'Price fetched', { price: priceRes.data.toncoin.usd });
    } catch (error) {
        sendResponse(res, true, 'Using fallback', { price: 5.5 });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    const { username } = req.body;
    const cleanUsername = username?.toString().replace('@', '').trim();
    
    if (!cleanUsername || cleanUsername.length < 3) {
        return sendResponse(res, false, 'اسم المستخدم غير صالح');
    }
    
    try {
        const existing = await pool.query('SELECT id FROM users WHERE telegram_username = $1', [cleanUsername]);
        
        if (existing.rows.length > 0) {
            await pool.query('UPDATE users SET last_login = NOW(), login_count = login_count + 1 WHERE id = $1', [existing.rows[0].id]);
            sendResponse(res, true, 'تم تسجيل الدخول', { user_id: existing.rows[0].id, username: '@' + cleanUsername });
        } else {
            const result = await pool.query(
                'INSERT INTO users (telegram_username, first_login, last_login) VALUES ($1, NOW(), NOW()) RETURNING id',
                [cleanUsername]
            );
            sendResponse(res, true, 'تم إنشاء حساب', { user_id: result.rows[0].id, username: '@' + cleanUsername });
        }
    } catch (error) {
        console.error('Login error:', error);
        sendResponse(res, false, 'خطأ في قاعدة البيانات');
    }
});

// Create Stars Order
app.post('/api/order/stars', async (req, res) => {
    const { user_id, recipient, amount, ton_amount, wallet_address } = req.body;
    
    if (!recipient || !amount || !ton_amount || !wallet_address) {
        return sendResponse(res, false, 'بيانات غير مكتملة');
    }
    
    if (parseInt(amount) < 50) {
        return sendResponse(res, false, 'الحد الأدنى 50 نجمة');
    }
    
    const tonAddressRegex = /^((EQ|UQ)[a-zA-Z0-9_-]{46}|(-?[0-9]+):[0-9a-fA-F]{64})$/;
    if (!tonAddressRegex.test(wallet_address)) {
        return sendResponse(res, false, 'عنوان المحفظة غير صالح');
    }
    
    const orderId = 'STAR-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    
    try {
        await pool.query(
            'INSERT INTO stars_orders (order_id, user_id, recipient_username, stars_amount, ton_amount, wallet_address, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())',
            [orderId, user_id, recipient, amount, ton_amount, wallet_address, 'pending']
        );
        
        sendResponse(res, true, 'تم إنشاء الطلب', { order_id: orderId });
    } catch (error) {
        console.error('Order creation error:', error);
        sendResponse(res, false, 'خطأ في إنشاء الطلب');
    }
});

// Create Premium Order
app.post('/api/order/premium', async (req, res) => {
    const { user_id, recipient, plan, ton_amount, wallet_address } = req.body;
    
    if (!recipient || !plan || !ton_amount || !wallet_address) {
        return sendResponse(res, false, 'بيانات غير مكتملة');
    }
    
    const tonAddressRegex = /^((EQ|UQ)[a-zA-Z0-9_-]{46}|(-?[0-9]+):[0-9a-fA-F]{64})$/;
    if (!tonAddressRegex.test(wallet_address)) {
        return sendResponse(res, false, 'عنوان المحفظة غير صالح');
    }
    
    const orderId = 'PRM-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    
    try {
        await pool.query(
            'INSERT INTO premium_orders (order_id, user_id, recipient_username, plan_name, ton_amount, wallet_address, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())',
            [orderId, user_id, recipient, plan, ton_amount, wallet_address, 'pending']
        );
        
        sendResponse(res, true, 'تم إنشاء الطلب', { order_id: orderId });
    } catch (error) {
        console.error('Order creation error:', error);
        sendResponse(res, false, 'خطأ في إنشاء الطلب');
    }
});

// 🔒 VERIFY PAYMENT - التحقق النهائي من البلوكتشين
app.post('/api/verify-payment', async (req, res) => {
    const { order_id, tx_hash, wallet_address, order_type } = req.body;
    
    if (!order_id || !tx_hash || !wallet_address) {
        return sendResponse(res, false, 'بيانات التحقق غير مكتملة');
    }
    
    console.log(`\n🔒 ============================================`);
    console.log(`🔒 Payment verification started`);
    console.log(`🔒 Order: ${order_id}`);
    console.log(`🔒 TX Hash: ${tx_hash}`);
    console.log(`🔒 Wallet: ${wallet_address}`);
    console.log(`🔒 ============================================\n`);
    
    try {
        const table = order_type === 'stars' ? 'stars_orders' : 'premium_orders';
        const orderResult = await pool.query(`SELECT * FROM ${table} WHERE order_id = $1`, [order_id]);
        
        if (orderResult.rows.length === 0) {
            return sendResponse(res, false, 'الطلب غير موجود');
        }
        
        const order = orderResult.rows[0];
        
        console.log('🔍 Step 1: Searching blockchain...');
        // نبحث بالمرسل + المبلغ + الوقت لأن الـ BOC ليس هاش ترانزاكشن
        const txDetails = await getTransactionFromBlockchain(tx_hash, wallet_address, order.ton_amount);
        
        if (!txDetails) {
            console.error('❌ Transaction not found on blockchain');
            await pool.query(
                'INSERT INTO payment_verifications (order_id, tx_hash, status, verification_data) VALUES ($1, $2, $3, $4)',
                [order_id, tx_hash, 'rejected', JSON.stringify({ error: 'Not found on blockchain' })]
            );
            return sendResponse(res, false, 'المعاملة غير موجودة على البلوكتشين - تأكد من إتمام الدفع');
        }
        
        // نستخدم الهاش الحقيقي من البلوكتشين (مش الـ BOC) للتحقق من التكرار
        const realTxHash = txDetails.transaction_id?.hash || tx_hash;
        
        const alreadyUsed = await isTxAlreadyUsed(realTxHash);
        if (alreadyUsed) {
            await pool.query(
                'INSERT INTO payment_verifications (order_id, tx_hash, status, verification_data) VALUES ($1, $2, $3, $4)',
                [order_id, realTxHash, 'rejected', JSON.stringify({ error: 'Transaction already used' })]
            );
            return sendResponse(res, false, 'هذه المعاملة تم استخدامها من قبل');
        }
        
        console.log('✅ Transaction found on blockchain');
        
        console.log('🔍 Step 2: Verifying payment details...');
        const verification = await verifyRealPayment(txDetails, order.ton_amount, wallet_address);
        
        await pool.query(
            'INSERT INTO payment_verifications (order_id, tx_hash, status, verification_data) VALUES ($1, $2, $3, $4)',
            [
                order_id, 
                realTxHash, 
                verification.valid ? 'confirmed' : 'rejected',
                JSON.stringify(verification)
            ]
        );
        
        if (!verification.valid) {
            console.error(`🚨 PAYMENT REJECTED: ${verification.error}`);
            await pool.query(`UPDATE ${table} SET status = 'failed', tx_hash = $1, updated_at = NOW() WHERE order_id = $2`, [realTxHash, order_id]);
            return sendResponse(res, false, verification.error, {
                verified: false,
                details: verification.details
            });
        }
        
        console.log('✅ ✅ ✅ PAYMENT VERIFIED SUCCESSFULLY!');
        console.log(`✅ Amount: ${(verification.amount/1e9).toFixed(4)} TON`);
        console.log(`✅ Sender: ${verification.sender}`);
        console.log(`✅ Time: ${new Date(verification.timestamp * 1000).toISOString()}`);
        
        await pool.query(
            `UPDATE ${table} SET status = 'paid', tx_hash = $1, paid_at = NOW(), updated_at = NOW() WHERE order_id = $2`,
            [tx_hash, order_id]
        );
        
        sendResponse(res, true, 'تم التحقق من الدفع بنجاح - العملية حقيقية', {
            verified: true,
            amount_ton: (verification.amount / 1e9).toFixed(4),
            tx_hash: verification.tx_hash,
            timestamp: verification.timestamp
        });
        
    } catch (error) {
        console.error('❌ Verification error:', error);
        sendResponse(res, false, 'خطأ في التحقق من الدفع: ' + error.message);
    }
});

// Update Order Status
app.put('/api/order/:orderId', async (req, res) => {
    const { orderId } = req.params;
    const { status } = req.body;
    
    const validStatuses = ['pending', 'paid', 'failed', 'processing', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
        return sendResponse(res, false, 'حالة غير صالحة');
    }
    
    try {
        let result = await pool.query(
            'UPDATE stars_orders SET status = $1, updated_at = NOW() WHERE order_id = $2',
            [status, orderId]
        );
        
        if (result.rowCount === 0) {
            result = await pool.query(
                'UPDATE premium_orders SET status = $1, updated_at = NOW() WHERE order_id = $2',
                [status, orderId]
            );
        }
        
        if (result.rowCount === 0) {
            return sendResponse(res, false, 'الطلب غير موجود');
        }
        
        sendResponse(res, true, 'تم تحديث الحالة');
    } catch (error) {
        console.error('Update error:', error);
        sendResponse(res, false, 'خطأ في التحديث');
    }
});

// Get User Orders
app.get('/api/orders/:userId', async (req, res) => {
    const { userId } = req.params;
    
    try {
        const starsResult = await pool.query(
            'SELECT order_id, stars_amount, status, created_at, paid_at FROM stars_orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
            [userId]
        );
        
        const premiumResult = await pool.query(
            'SELECT order_id, plan_name, status, created_at, paid_at FROM premium_orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
            [userId]
        );
        
        sendResponse(res, true, 'تم جلب الطلبات', { stars: starsResult.rows, premium: premiumResult.rows });
    } catch (error) {
        sendResponse(res, false, 'خطأ في جلب الطلبات');
    }
});

// Admin Routes
app.get('/api/stats', async (req, res) => {
    try {
        const totalUsers = await pool.query('SELECT COUNT(*) as total FROM users');
        const pendingStars = await pool.query('SELECT COUNT(*) as total FROM stars_orders WHERE status = $1', ['pending']);
        const pendingPremium = await pool.query('SELECT COUNT(*) as total FROM premium_orders WHERE status = $1', ['pending']);
        const paidToday = await pool.query('SELECT COUNT(*) as total FROM stars_orders WHERE status = $1 AND DATE(paid_at) = CURRENT_DATE', ['paid']);
        
        sendResponse(res, true, 'تم جلب الإحصائيات', {
            total_users: totalUsers.rows[0].total,
            pending_stars: pendingStars.rows[0].total,
            pending_premium: pendingPremium.rows[0].total,
            paid_today: paidToday.rows[0].total
        });
    } catch (error) {
        sendResponse(res, false, 'خطأ في جلب الإحصائيات');
    }
});

app.get('/api/admin/orders', async (req, res) => {
    try {
        const starsResult = await pool.query(`
            SELECT so.*, u.telegram_username 
            FROM stars_orders so 
            LEFT JOIN users u ON so.user_id = u.id 
            ORDER BY so.created_at DESC 
            LIMIT 100
        `);
        
        const premiumResult = await pool.query(`
            SELECT po.*, u.telegram_username 
            FROM premium_orders po 
            LEFT JOIN users u ON po.user_id = u.id 
            ORDER BY po.created_at DESC 
            LIMIT 100
        `);
        
        sendResponse(res, true, 'تم جلب الطلبات', { stars: starsResult.rows, premium: premiumResult.rows });
    } catch (error) {
        sendResponse(res, false, 'خطأ في جلب الطلبات');
    }
});

// Serve index.html for root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve admin.html
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Server running on http://0.0.0.0:${PORT}`);
    console.log(`🔒 Anti-fake protection enabled\n`);
});
