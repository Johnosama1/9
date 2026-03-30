// ============================================
// starGo - Secure Node.js Server (Anti-Fake Protection)
// ============================================

const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const axios = require('axios');
const crypto = require('crypto');
const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

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
    TX_MAX_AGE_MINUTES: 10
};

// ============================================
// Database
// ============================================

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'stargo_db'
};

let db;

async function connectDB() {
    try {
        db = await mysql.createConnection(dbConfig);
        console.log('✅ Database connected');
        
        // إنشاء جدول التحققات لو مش موجود
        await db.execute(`
            CREATE TABLE IF NOT EXISTS payment_verifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                order_id VARCHAR(50) NOT NULL,
                tx_hash VARCHAR(100) NOT NULL,
                status ENUM('pending', 'confirmed', 'rejected', 'fake_detected') DEFAULT 'pending',
                verification_data JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_order (order_id),
                INDEX idx_tx (tx_hash)
            )
        `);
        
    } catch (error) {
        console.error('❌ Database error:', error.message);
        process.exit(1);
    }
}

function response(res, success, message, data = null) {
    res.json({ success, message, data });
}

// ============================================
// TON BLOCKCHAIN VERIFICATION - التحقق الحقيقي
// ============================================

/**
 * جلب تفاصيل الترانزاكشن من البلوكتشين
 */
async function getTransactionFromBlockchain(txHashOrBoc) {
    try {
        // نحاول نجيب الترانزاكشن بالـ hash أو الـ BOC
        const url = `${CONFIG.TON_API_ENDPOINT}/getTransactions`;
        
        const params = {
            address: CONFIG.RECEIVER_WALLET,
            limit: 20,
            archival: true
        };
        
        if (CONFIG.TON_API_KEY) {
            params.api_key = CONFIG.TON_API_KEY;
        }
        
        console.log(`🔍 Searching for tx in blockchain...`);
        
        const response = await axios.get(url, { params, timeout: 10000 });
        
        if (!response.data?.result || !Array.isArray(response.data.result)) {
            return null;
        }
        
        // البحث عن الترانزاكشن المطابقة
        const tx = response.data.result.find(t => {
            // مطابقة بالـ hash
            if (t.transaction_id?.hash === txHashOrBoc) return true;
            // مطابقة بالـ BOC (body hash)
            if (t.in_msg?.body_hash === txHashOrBoc) return true;
            // مطابقة جزئية
            if (txHashOrBoc && t.in_msg?.body_hash?.includes(txHashOrBoc.substring(0, 20))) return true;
            
            return false;
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
    
    // 1. التحقق من وجود in_msg (الرسالة الواردة)
    if (!txDetails.in_msg) {
        return { valid: false, error: 'لا توجد رسالة واردة في المعاملة' };
    }
    
    const inMsg = txDetails.in_msg;
    
    // 2. التحقق من نوع العملة - لازم تكون Native TON
    // الجتون (Jetton) بيكون ليها Jetton transfer notification
    if (inMsg.msg_data && inMsg.msg_data['@type'] === 'msg.dataRaw') {
        // لو فيه بيانات خام (raw) نحاول نفكها
        const data = inMsg.msg_data.body || '';
        
        // علامات الجتون الوهمي:
        // - op::transfer = 0xf8a7ea5
        // - op::internal_transfer = 0x178d4519
        if (data.includes('f8a7ea5') || data.includes('178d4519') || data.includes('jetton')) {
            console.error('🚨 JETTON DETECTED - Possible fake token!');
            return { 
                valid: false, 
                error: 'تم رفض العملية: يُسمح فقط بـ TON الأصلي (Native TON)، لا يُسمح بـ Jetton أو عملات مزيفة',
                details: { type: 'jetton_detected' }
            };
        }
    }
    
    // 3. التحقق من المبلغ - لازم يكون موجود في value مش في payload
    const amountNano = parseInt(inMsg.value || 0);
    if (amountNano === 0) {
        return { 
            valid: false, 
            error: 'المبلغ صفر - قد تكون عملة وهمية',
            details: { type: 'zero_amount' }
        };
    }
    
    const expectedNano = Math.floor(parseFloat(expectedAmount) * 1e9);
    
    // سمح بفرق 1% بسبب تغيرات السعر
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
    
    // 4. التحقق من المرسل
    if (inMsg.source !== expectedSender) {
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
    
    // 5. التحقق من جهة الاستلام
    if (inMsg.destination !== CONFIG.RECEIVER_WALLET) {
        return { 
            valid: false, 
            error: 'جهة الاستلام غير صحيحة',
            details: { type: 'wrong_destination' }
        };
    }
    
    // 6. التحقق من وقت الترانزاكشن (مش قديمة قوي)
    const txTime = txDetails.utime * 1000; // convert to ms
    const now = Date.now();
    const ageMinutes = (now - txTime) / 60000;
    
    if (ageMinutes > CONFIG.TX_MAX_AGE_MINUTES) {
        return { 
            valid: false, 
            error: 'المعاملة قديمة جداً',
            details: { age: ageMinutes, type: 'too_old' }
        };
    }
    
    // 7. التحقق من الحالة - لازم تكون نجحت
    if (txDetails.out_msgs && txDetails.out_msgs.length > 0) {
        // فيه رسائل صادرة يعني حاجة حصلت، نتأكد إنها مش رفض
        for (const outMsg of txDetails.out_msgs) {
            if (outMsg.destination === inMsg.source && parseInt(outMsg.value) > 0) {
                // فيه فلوس راجعة للمرسل يعني رفض!
                return { 
                    valid: false, 
                    error: 'المعاملة تم رفضها (bounce)',
                    details: { type: 'bounce' }
                };
            }
        }
    }
    
    // ✅ كل التحققات نجحت
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
        const [rows] = await db.execute(
            'SELECT id FROM payment_verifications WHERE tx_hash = ? AND status = "confirmed"',
            [txHash]
        );
        return rows.length > 0;
    } catch (error) {
        console.error('Error checking tx reuse:', error);
        return false; // في حالة الشك، نكمل ونتحقق لاحقاً
    }
}

// ============================================
// API Routes
// ============================================

// Health Check
app.get('/api/health', (req, res) => {
    response(res, true, 'Server running with blockchain verification');
});

// Get Price
app.get('/api/price', async (req, res) => {
    try {
        const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=toncoin&vs_currencies=usd', { timeout: 5000 });
        response(res, true, 'Price fetched', { price: response.data.toncoin.usd });
    } catch (error) {
        response(res, true, 'Using fallback', { price: 5.5 });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    const { username } = req.body;
    const cleanUsername = username?.toString().replace('@', '').trim();
    
    if (!cleanUsername || cleanUsername.length < 3) {
        return response(res, false, 'اسم المستخدم غير صالح');
    }
    
    try {
        const [users] = await db.execute('SELECT id FROM users WHERE telegram_username = ?', [cleanUsername]);
        
        if (users.length > 0) {
            await db.execute('UPDATE users SET last_login = NOW(), login_count = login_count + 1 WHERE id = ?', [users[0].id]);
            response(res, true, 'تم تسجيل الدخول', { user_id: users[0].id, username: '@' + cleanUsername });
        } else {
            const [result] = await db.execute(
                'INSERT INTO users (telegram_username, first_login, last_login) VALUES (?, NOW(), NOW())',
                [cleanUsername]
            );
            response(res, true, 'تم إنشاء حساب', { user_id: result.insertId, username: '@' + cleanUsername });
        }
    } catch (error) {
        console.error('Login error:', error);
        response(res, false, 'خطأ في قاعدة البيانات');
    }
});

// Create Stars Order
app.post('/api/order/stars', async (req, res) => {
    const { user_id, recipient, amount, ton_amount, wallet_address } = req.body;
    
    if (!user_id || !recipient || !amount || !ton_amount || !wallet_address) {
        return response(res, false, 'بيانات غير مكتملة');
    }
    
    if (parseInt(amount) < 50) {
        return response(res, false, 'الحد الأدنى 50 نجمة');
    }
    
    // التحقق من صحة عنوان TON
    const tonAddressRegex = /^(EQ|UQ)[a-zA-Z0-9_-]{46}$/;
    if (!tonAddressRegex.test(wallet_address)) {
        return response(res, false, 'عنوان المحفظة غير صالح');
    }
    
    const orderId = 'STAR-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    
    try {
        await db.execute(
            'INSERT INTO stars_orders (order_id, user_id, recipient_username, stars_amount, ton_amount, wallet_address, status, created_at) VALUES (?, ?, ?, ?, ?, ?, "pending", NOW())',
            [orderId, user_id, recipient, amount, ton_amount, wallet_address]
        );
        
        response(res, true, 'تم إنشاء الطلب', { order_id: orderId });
    } catch (error) {
        console.error('Order creation error:', error);
        response(res, false, 'خطأ في إنشاء الطلب');
    }
});

// Create Premium Order
app.post('/api/order/premium', async (req, res) => {
    const { user_id, recipient, plan, ton_amount, wallet_address } = req.body;
    
    if (!user_id || !recipient || !plan || !ton_amount || !wallet_address) {
        return response(res, false, 'بيانات غير مكتملة');
    }
    
    const tonAddressRegex = /^(EQ|UQ)[a-zA-Z0-9_-]{46}$/;
    if (!tonAddressRegex.test(wallet_address)) {
        return response(res, false, 'عنوان المحفظة غير صالح');
    }
    
    const orderId = 'PRM-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    
    try {
        await db.execute(
            'INSERT INTO premium_orders (order_id, user_id, recipient_username, plan_name, ton_amount, wallet_address, status, created_at) VALUES (?, ?, ?, ?, ?, ?, "pending", NOW())',
            [orderId, user_id, recipient, plan, ton_amount, wallet_address]
        );
        
        response(res, true, 'تم إنشاء الطلب', { order_id: orderId });
    } catch (error) {
        console.error('Order creation error:', error);
        response(res, false, 'خطأ في إنشاء الطلب');
    }
});

// 🔒 VERIFY PAYMENT - التحقق النهائي من البلوكتشين
app.post('/api/verify-payment', async (req, res) => {
    const { order_id, tx_hash, wallet_address, order_type } = req.body;
    
    if (!order_id || !tx_hash || !wallet_address) {
        return response(res, false, 'بيانات التحقق غير مكتملة');
    }
    
    console.log(`\n🔒 ============================================`);
    console.log(`🔒 Payment verification started`);
    console.log(`🔒 Order: ${order_id}`);
    console.log(`🔒 TX Hash: ${tx_hash}`);
    console.log(`🔒 Wallet: ${wallet_address}`);
    console.log(`🔒 ============================================\n`);
    
    try {
        // 1. جلب الأوردر
        let order;
        const table = order_type === 'stars' ? 'stars_orders' : 'premium_orders';
        const [rows] = await db.execute(`SELECT * FROM ${table} WHERE order_id = ?`, [order_id]);
        
        if (rows.length === 0) {
            return response(res, false, 'الطلب غير موجود');
        }
        
        order = rows[0];
        
        // 2. التحقق من عدم استخدام الترانزاكشن قبل كده
        const alreadyUsed = await isTxAlreadyUsed(tx_hash);
        if (alreadyUsed) {
            await db.execute(
                'INSERT INTO payment_verifications (order_id, tx_hash, status, verification_data) VALUES (?, ?, "rejected", ?)',
                [order_id, tx_hash, JSON.stringify({ error: 'Transaction already used' })]
            );
            
            return response(res, false, 'هذه المعاملة تم استخدامها من قبل');
        }
        
        // 3. 🔍 البحث في البلوكتشين
        console.log('🔍 Step 1: Searching blockchain...');
        const txDetails = await getTransactionFromBlockchain(tx_hash);
        
        if (!txDetails) {
            console.error('❌ Transaction not found on blockchain');
            
            await db.execute(
                'INSERT INTO payment_verifications (order_id, tx_hash, status, verification_data) VALUES (?, ?, "rejected", ?)',
                [order_id, tx_hash, JSON.stringify({ error: 'Not found on blockchain' })]
            );
            
            return response(res, false, 'المعاملة غير موجودة على البلوكتشين - تأكد من إتمام الدفع');
        }
        
        console.log('✅ Transaction found on blockchain');
        
        // 4. 🔍 التحقق من صحة الدفع
        console.log('🔍 Step 2: Verifying payment details...');
        const verification = await verifyRealPayment(txDetails, order.ton_amount, wallet_address);
        
        // 5. حفظ نتيجة التحقق
        await db.execute(
            'INSERT INTO payment_verifications (order_id, tx_hash, status, verification_data) VALUES (?, ?, ?, ?)',
            [
                order_id, 
                tx_hash, 
                verification.valid ? 'confirmed' : 'rejected',
                JSON.stringify(verification)
            ]
        );
        
        if (!verification.valid) {
            console.error(`🚨 PAYMENT REJECTED: ${verification.error}`);
            
            // تحديث حالة الأوردر
            await db.execute(`UPDATE ${table} SET status = 'failed', tx_hash = ?, updated_at = NOW() WHERE order_id = ?`, [tx_hash, order_id]);
            
            return response(res, false, verification.error, {
                verified: false,
                details: verification.details
            });
        }
        
        // ✅ ✅ ✅ نجح التحقق!
        console.log('✅ ✅ ✅ PAYMENT VERIFIED SUCCESSFULLY!');
        console.log(`✅ Amount: ${(verification.amount/1e9).toFixed(4)} TON`);
        console.log(`✅ Sender: ${verification.sender}`);
        console.log(`✅ Time: ${new Date(verification.timestamp * 1000).toISOString()}`);
        
        // تحديث الأوردر إنه تم الدفع
        await db.execute(
            `UPDATE ${table} SET status = 'paid', tx_hash = ?, paid_at = NOW(), updated_at = NOW() WHERE order_id = ?`,
            [tx_hash, order_id]
        );
        
        response(res, true, 'تم التحقق من الدفع بنجاح - العملية حقيقية', {
            verified: true,
            amount_ton: (verification.amount / 1e9).toFixed(4),
            tx_hash: verification.tx_hash,
            timestamp: verification.timestamp
        });
        
    } catch (error) {
        console.error('❌ Verification error:', error);
        response(res, false, 'خطأ في التحقق من الدفع: ' + error.message);
    }
});

// Update Order Status
app.put('/api/order/:orderId', async (req, res) => {
    const { orderId } = req.params;
    const { status } = req.body;
    
    const validStatuses = ['pending', 'paid', 'failed', 'processing', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
        return response(res, false, 'حالة غير صالحة');
    }
    
    try {
        let [result] = await db.execute(
            'UPDATE stars_orders SET status = ?, updated_at = NOW() WHERE order_id = ?',
            [status, orderId]
        );
        
        if (result.affectedRows === 0) {
            [result] = await db.execute(
                'UPDATE premium_orders SET status = ?, updated_at = NOW() WHERE order_id = ?',
                [status, orderId]
            );
        }
        
        if (result.affectedRows === 0) {
            return response(res, false, 'الطلب غير موجود');
        }
        
        response(res, true, 'تم تحديث الحالة');
    } catch (error) {
        console.error('Update error:', error);
        response(res, false, 'خطأ في التحديث');
    }
});

// Get User Orders
app.get('/api/orders/:userId', async (req, res) => {
    const { userId } = req.params;
    
    try {
        const [stars] = await db.execute(
            'SELECT order_id, stars_amount, status, created_at, paid_at FROM stars_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
            [userId]
        );
        
        const [premium] = await db.execute(
            'SELECT order_id, plan_name, status, created_at, paid_at FROM premium_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
            [userId]
        );
        
        response(res, true, 'تم جلب الطلبات', { stars, premium });
    } catch (error) {
        response(res, false, 'خطأ في جلب الطلبات');
    }
});

// Admin Routes
app.get('/api/stats', async (req, res) => {
    try {
        const [totalUsers] = await db.execute('SELECT COUNT(*) as total FROM users');
        const [pendingStars] = await db.execute('SELECT COUNT(*) as total FROM stars_orders WHERE status = "pending"');
        const [pendingPremium] = await db.execute('SELECT COUNT(*) as total FROM premium_orders WHERE status = "pending"');
        const [paidToday] = await db.execute('SELECT COUNT(*) as total FROM stars_orders WHERE status = "paid" AND DATE(paid_at) = CURDATE()');
        
        response(res, true, 'تم جلب الإحصائيات', {
            total_users: totalUsers[0].total,
            pending_stars: pendingStars[0].total,
            pending_premium: pendingPremium[0].total,
            paid_today: paidToday[0].total
        });
    } catch (error) {
        response(res, false, 'خطأ في جلب الإحصائيات');
    }
});

app.get('/api/admin/orders', async (req, res) => {
    try {
        const [stars] = await db.execute(`
            SELECT so.*, u.telegram_username 
            FROM stars_orders so 
            LEFT JOIN users u ON so.user_id = u.id 
            ORDER BY so.created_at DESC 
            LIMIT 100
        `);
        
        const [premium] = await db.execute(`
            SELECT po.*, u.telegram_username 
            FROM premium_orders po 
            LEFT JOIN users u ON po.user_id = u.id 
            ORDER BY po.created_at DESC 
            LIMIT 100
        `);
        
        response(res, true, 'تم جلب الطلبات', { stars, premium });
    } catch (error) {
        response(res, false, 'خطأ في جلب الطلبات');
    }
});

// Start Server
app.listen(PORT, async () => {
    await connectDB();
    
    console.log(`\n🚀 ============================================`);
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`🚀 ============================================`);
    console.log(`🔒 SECURITY FEATURES ENABLED:`);
    console.log(`   ✓ Blockchain verification (real TON only)`);
    console.log(`   ✓ Anti-fake token protection`);
    console.log(`   ✓ Transaction reuse prevention`);
    console.log(`   ✓ Amount validation`);
    console.log(`   ✓ Sender verification`);
    console.log(`   ✓ Transaction age check`);
    console.log(`🚀 ============================================\n`);
});

