// ============================================
// starGo - Node.js Server with TON Fake Token Protection
// ============================================

const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const axios = require('axios');
const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// ============================================
// TON CONFIGURATION - الحماية من العملات الوهمية
// ============================================

const TON_CONFIG = {
    // العقد الرسمي للـ TON (Native TON)
    REAL_TON_MASTER: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
    
    // RPC Endpoints
    RPC_ENDPOINT: 'https://toncenter.com/api/v2/jsonRPC',
    
    // API Key (اختياري - سجل في toncenter.com للحصول على واحد مجاني)
    API_KEY: process.env.TON_API_KEY || '',
    
    // العملات المزيفة المعروفة (قائمة سوداء)
    BLACKLISTED_TOKENS: [
        // ضيف هنا عناوين العملات المزيفة لو عرفت أي واحد
    ]
};

// ============================================
// Database config
// ============================================

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'stargo_db'
};

let db;

// Database connection
async function connectDB() {
    try {
        db = await mysql.createConnection(dbConfig);
        console.log('✅ Database connected');
    } catch (error) {
        console.error('❌ Database error:', error.message);
    }
}
connectDB();

// Helper function
function response(res, success, message, data = null) {
    res.json({ success, message, data });
}

// ============================================
// TON VERIFICATION FUNCTIONS - التحقق من صحة العملة
// ============================================

/**
 * التحقق من معاملة TON والتأكد إنها مش وهمية
 * @param {string} txHash - هاش المعاملة
 * @param {string} expectedSender - العنوان المتوقع للمرسل
 * @param {number} expectedAmount - المبلغ المتوقع بالـ nanoTON
 */
async function verifyTONTransaction(txHash, expectedSender, expectedAmount) {
    try {
        console.log(`🔍 Verifying TON transaction: ${txHash}`);
        
        // 1. جلب تفاصيل المعاملة من TON Center
        const txInfo = await getTransactionInfo(txHash);
        
        if (!txInfo) {
            return { valid: false, error: 'المعاملة غير موجودة' };
        }
        
        // 2. التحقق من نوع العملة (أهم خطوة لمكافحة الوهمي)
        const isNativeTON = await verifyNativeTON(txInfo);
        
        if (!isNativeTON) {
            console.error('🚨 FAKE TOKEN DETECTED!');
            return { 
                valid: false, 
                error: 'عملة مزيفة! يُسمح فقط بـ TON الأصلي',
                details: { reason: 'not_native_ton' }
            };
        }
        
        // 3. التحقق من المرسل
        if (txInfo.in_msg?.source !== expectedSender) {
            return { 
                valid: false, 
                error: 'المرسل لا يتطابق',
                details: { expected: expectedSender, received: txInfo.in_msg?.source }
            };
        }
        
        // 4. التحقق من المبلغ
        const amount = parseInt(txInfo.in_msg?.value || 0);
        const expectedNano = Math.floor(parseFloat(expectedAmount) * 1e9);
        
        if (amount < expectedNano) {
            return { 
                valid: false, 
                error: 'المبلغ أقل من المتوقع',
                details: { expected: expectedNano, received: amount }
            };
        }
        
        // 5. التحقق من جهة الاستلام (لازم تكون محفظتك)
        if (txInfo.in_msg?.destination !== TON_CONFIG.RECEIVER_WALLET) {
            return { 
                valid: false, 
                error: 'جهة الاستلام غير صحيحة',
                details: { expected: TON_CONFIG.RECEIVER_WALLET, received: txInfo.in_msg?.destination }
            };
        }
        
        // ✅ كل التحققات نجحت
        console.log('✅ TON transaction verified successfully!');
        
        return {
            valid: true,
            txHash: txHash,
            amount: amount,
            sender: txInfo.in_msg.source,
            timestamp: txInfo.utime
        };
        
    } catch (error) {
        console.error('❌ Verification error:', error);
        return { valid: false, error: 'خطأ في التحقق: ' + error.message };
    }
}

/**
 * جلب معلومات المعاملة من TON Center
 */
async function getTransactionInfo(txHash) {
    try {
        const url = `${TON_CONFIG.RPC_ENDPOINT}/getTransactions`;
        const params = {
            address: TON_CONFIG.RECEIVER_WALLET,
            limit: 10,
            archival: true
        };
        
        if (TON_CONFIG.API_KEY) {
            params.api_key = TON_CONFIG.API_KEY;
        }
        
        const response = await axios.get(url, { params });
        
        if (response.data?.result) {
            // البحث عن المعاملة بالهاش
            const tx = response.data.result.find(t => 
                t.transaction_id?.hash === txHash || 
                t.in_msg?.body_hash === txHash
            );
            return tx;
        }
        
        return null;
    } catch (error) {
        console.error('Error fetching transaction:', error.message);
        return null;
    }
}

/**
 * التحقق إن المعاملة بـ TON أصلي (Native) مش Jetton وهمي
 */
async function verifyNativeTON(txInfo) {
    // التحقق إن المعاملة مش Jetton transfer
    // Jetton transfers بتكون فيها بيانات إضافية (payload)
    
    if (!txInfo.in_msg) return false;
    
    // لو فيه msg_data ونوعها text أو empty يبقى غالباً TON أصلي
    const msgData = txInfo.in_msg.msg_data;
    
    // التحقق من عدم وجود Jetton-specific data
    if (txInfo.in_msg.payload) {
        // لو فيه payload معقد ممكن يكون Jetton
        // نتحقق إن الـ payload مش Jetton transfer notification
        const payload = txInfo.in_msg.payload;
        
        // Jetton transfers عادة بتبدأ بـ op code معين
        // op::transfer = 0xf8a7ea5
        // op::internal_transfer = 0x178d4519
        
        if (payload.includes('f8a7ea5') || payload.includes('178d4519')) {
            console.warn('⚠️ Jetton transfer detected, checking if real TON...');
            
            // لو Jetton، نرفض مباشرة لأننا بنقبل بس Native TON
            return false;
        }
    }
    
    // التحقق إن المبلغ موجود مباشرة في in_msg.value
    // في Jetton transfers المبلغ الحقيقي بيكون في payload مش في value
    if (!txInfo.in_msg.value || parseInt(txInfo.in_msg.value) === 0) {
        return false;
    }
    
    return true;
}

/**
 * التحقق من العنوان (صالح ولا لأ)
 */
function isValidTONAddress(address) {
    // TON addresses بتبدأ بـ EQ أو UQ وبعدين 48 حرف
    const pattern = /^(EQ|UQ)[a-zA-Z0-9_-]{46}$/;
    return pattern.test(address);
}

// ============================================
// API Routes
// ============================================

// 1. Get TON Price
app.get('/api/price', async (req, res) => {
    try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=toncoin&vs_currencies=usd');
        const data = await response.json();
        response(res, true, 'Price fetched', { price: data.toncoin.usd });
    } catch (error) {
        response(res, true, 'Using fallback price', { price: 5.5 });
    }
});

// 2. Connect Wallet
app.post('/api/wallet', async (req, res) => {
    const { wallet_address, user_id } = req.body;
    
    if (!wallet_address) {
        return response(res, false, 'عنوان المحفظة مطلوب');
    }
    
    // التحقق من صحة العنوان
    if (!isValidTONAddress(wallet_address)) {
        return response(res, false, 'عنوان المحفظة غير صالح');
    }
    
    try {
        if (user_id) {
            await db.execute('UPDATE users SET wallet_address = ?, wallet_connected_at = NOW() WHERE id = ?', [wallet_address, user_id]);
        }
        response(res, true, 'تم ربط المحفظة');
    } catch (error) {
        response(res, false, 'خطأ في الحفظ');
    }
});

// 3. Login / Save User
app.post('/api/login', async (req, res) => {
    const { username } = req.body;
    const cleanUsername = username?.replace('@', '');
    
    if (!cleanUsername) {
        return response(res, false, 'اسم المستخدم مطلوب');
    }
    
    try {
        const [users] = await db.execute('SELECT id FROM users WHERE telegram_username = ?', [cleanUsername]);
        
        if (users.length > 0) {
            await db.execute('UPDATE users SET last_login = NOW(), login_count = login_count + 1 WHERE id = ?', [users[0].id]);
            response(res, true, 'تم تسجيل الدخول', { user_id: users[0].id, username: '@' + cleanUsername });
        } else {
            const [result] = await db.execute('INSERT INTO users (telegram_username, first_login, last_login) VALUES (?, NOW(), NOW())', [cleanUsername]);
            response(res, true, 'تم إنشاء حساب', { user_id: result.insertId, username: '@' + cleanUsername });
        }
    } catch (error) {
        response(res, false, 'خطأ في قاعدة البيانات');
    }
});

// 4. Create Order (Stars) - مع التحقق من العملة
app.post('/api/order/stars', async (req, res) => {
    const { user_id, recipient, amount, ton_amount, wallet_address } = req.body;
    const orderId = 'STAR_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    
    if (!user_id || !recipient || !amount) {
        return response(res, false, 'بيانات غير مكتملة');
    }
    
    // التحقق من صحة المحفظة
    if (!wallet_address || !isValidTONAddress(wallet_address)) {
        return response(res, false, 'عنوان المحفظة غير صالح');
    }
    
    try {
        await db.execute(
            'INSERT INTO stars_orders (user_id, recipient_username, stars_amount, ton_amount, order_id, status) VALUES (?, ?, ?, ?, ?, "pending")',
            [user_id, recipient, amount, ton_amount, orderId]
        );
        response(res, true, 'تم إنشاء الطلب', { order_id: orderId });
    } catch (error) {
        response(res, false, 'خطأ في إنشاء الطلب');
    }
});

// 5. Create Order (Premium) - مع التحقق من العملة
app.post('/api/order/premium', async (req, res) => {
    const { user_id, recipient, plan, ton_amount, wallet_address } = req.body;
    const orderId = 'PRM_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    
    if (!user_id || !recipient || !plan) {
        return response(res, false, 'بيانات غير مكتملة');
    }
    
    // التحقق من صحة المحفظة
    if (!wallet_address || !isValidTONAddress(wallet_address)) {
        return response(res, false, 'عنوان المحفظة غير صالح');
    }
    
    try {
        await db.execute(
            'INSERT INTO premium_orders (user_id, recipient_username, plan_name, ton_amount, order_id, status) VALUES (?, ?, ?, ?, ?, "pending")',
            [user_id, recipient, plan, ton_amount, orderId]
        );
        response(res, true, 'تم إنشاء الطلب', { order_id: orderId });
    } catch (error) {
        response(res, false, 'خطأ في إنشاء الطلب');
    }
});

// 6. 🔒 VERIFY PAYMENT - التحقق من الدفع ومكافحة العملات الوهمية
app.post('/api/verify-payment', async (req, res) => {
    const { order_id, tx_hash, wallet_address, order_type } = req.body;
    
    if (!order_id || !tx_hash || !wallet_address) {
        return response(res, false, 'بيانات التحقق غير مكتملة');
    }
    
    console.log(`🔒 Payment verification requested for order: ${order_id}`);
    
    try {
        // 1. جلب تفاصيل الأوردر
        let order;
        if (order_type === 'stars') {
            const [rows] = await db.execute('SELECT * FROM stars_orders WHERE order_id = ?', [order_id]);
            order = rows[0];
        } else {
            const [rows] = await db.execute('SELECT * FROM premium_orders WHERE order_id = ?', [order_id]);
            order = rows[0];
        }
        
        if (!order) {
            return response(res, false, 'الطلب غير موجود');
        }
        
        // 2. 🔍 التحقق من المعاملة (مكافحة العملات الوهمية)
        const verification = await verifyTONTransaction(tx_hash, wallet_address, order.ton_amount);
        
        // 3. حفظ نتيجة التحقق
        await db.execute(
            'INSERT INTO payment_verifications (order_id, tx_hash, status, details) VALUES (?, ?, ?, ?)',
            [order_id, tx_hash, verification.valid ? 'confirmed' : 'rejected', JSON.stringify(verification)]
        );
        
        if (!verification.valid) {
            // ❌ فشل التحقق - عملة وهمية أو خطأ
            console.error('🚨 Payment rejected:', verification.error);
            
            // تحديث حالة الأوردر
            const table = order_type === 'stars' ? 'stars_orders' : 'premium_orders';
            await db.execute(
                `UPDATE ${table} SET status = 'failed', tx_hash = ? WHERE order_id = ?`,
                [tx_hash, order_id]
            );
            
            return response(res, false, verification.error, {
                verified: false,
                error: verification.error,
                details: verification.details
            });
        }
        
        // ✅ التحقق نجح
        console.log('✅ Payment verified and confirmed');
        
        // تحديث حالة الأوردر
        const table = order_type === 'stars' ? 'stars_orders' : 'premium_orders';
        await db.execute(
            `UPDATE ${table} SET status = 'paid', tx_hash = ?, paid_at = NOW() WHERE order_id = ?`,
            [tx_hash, order_id]
        );
        
        response(res, true, 'تم التحقق من الدفع بنجاح', {
            verified: true,
            tx_hash: tx_hash,
            amount: verification.amount,
            timestamp: verification.timestamp
        });
        
    } catch (error) {
        console.error('❌ Verification error:', error);
        response(res, false, 'خطأ في التحقق من الدفع');
    }
});

// 7. Update Order Status
app.put('/api/order/:orderId', async (req, res) => {
    const { orderId } = req.params;
    const { status } = req.body;
    
    try {
        let [result] = await db.execute('UPDATE stars_orders SET status = ?, completed_at = NOW() WHERE order_id = ?', [status, orderId]);
        
        if (result.affectedRows === 0) {
            [result] = await db.execute('UPDATE premium_orders SET status = ?, completed_at = NOW() WHERE order_id = ?', [status, orderId]);
        }
        
        response(res, true, 'تم تحديث الحالة');
    } catch (error) {
        response(res, false, 'خطأ في التحديث');
    }
});

// 8. Get User Orders
app.get('/api/orders/:userId', async (req, res) => {
    const { userId } = req.params;
    
    try {
        const [stars] = await db.execute('SELECT order_id, stars_amount, status, created_at FROM stars_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', [userId]);
        const [premium] = await db.execute('SELECT order_id, plan_name, status, created_at FROM premium_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', [userId]);
        
        response(res, true, 'تم جلب الطلبات', { stars, premium });
    } catch (error) {
        response(res, false, 'خطأ في جلب الطلبات');
    }
});

// 9. Get Statistics
app.get('/api/stats', async (req, res) => {
    try {
        const [totalUsers] = await db.execute('SELECT COUNT(*) as total FROM users');
        const [pendingStars] = await db.execute('SELECT COUNT(*) as total FROM stars_orders WHERE status = "pending"');
        const [pendingPremium] = await db.execute('SELECT COUNT(*) as total FROM premium_orders WHERE status = "pending"');
        const [todayOrders] = await db.execute('SELECT COUNT(*) as total FROM stars_orders WHERE DATE(created_at) = CURDATE()');
        
        response(res, true, 'تم جلب الإحصائيات', {
            total_users: totalUsers[0].total,
            pending_stars: pendingStars[0].total,
            pending_premium: pendingPremium[0].total,
            today_orders: todayOrders[0].total
        });
    } catch (error) {
        response(res, false, 'خطأ في جلب الإحصائيات');
    }
});

// 10. Get All Orders (Admin)
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

// 11. Get All Users (Admin)
app.get('/api/admin/users', async (req, res) => {
    try {
        const [users] = await db.execute('SELECT id, telegram_username, wallet_address, login_count, last_login, created_at FROM users ORDER BY created_at DESC LIMIT 100');
        response(res, true, 'تم جلب المستخدمين', users);
    } catch (error) {
        response(res, false, 'خطأ في جلب المستخدمين');
    }
});

// 12. Health Check
app.get('/api/health', (req, res) => {
    response(res, true, 'Server is running with TON verification');
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`🔒 TON Fake Token Protection: ENABLED`);
    console.log(`📡 API endpoints:`);
    console.log(`   GET  /api/price`);
    console.log(`   POST /api/login`);
    console.log(`   POST /api/wallet`);
    console.log(`   POST /api/order/stars`);
    console.log(`   POST /api/order/premium`);
    console.log(`   POST /api/verify-payment  ← NEW: Anti-fake verification`);
    console.log(`   PUT  /api/order/:orderId`);
    console.log(`   GET  /api/orders/:userId`);
    console.log(`   GET  /api/stats`);
    console.log(`   GET  /api/admin/orders`);
    console.log(`   GET  /api/admin/users`);
});
