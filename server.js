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
    // محفظة الاستلام (غيرها لمحفظتك)
    RECEIVER_WALLET: "UQBPpnRDUyTVXzJk4Qxr02z4iPFZfWv8NC2fvOjHe8UtmpHE",
    
    // RPC Endpoints
    RPC_ENDPOINT: 'https://toncenter.com/api/v2',
    
    // API Key (اختياري - سجل في toncenter.com)
    API_KEY: process.env.TON_API_KEY || ''
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

async function connectDB() {
    try {
        db = await mysql.createConnection(dbConfig);
        console.log('✅ Database connected');
    } catch (error) {
        console.error('❌ Database error:', error.message);
    }
}
connectDB();

function response(res, success, message, data = null) {
    res.json({ success, message, data });
}

// ============================================
// TON VERIFICATION - التحقق من صحة العملة
// ============================================

/**
 * التحقق من المعاملة (مكافحة العملات الوهمية)
 */
async function verifyTONTransaction(txHash, expectedSender, expectedAmount) {
    try {
        console.log(`🔍 Verifying transaction: ${txHash}`);
        
        // جلب المعاملة من TON Center
        const txInfo = await getTransactionInfo(txHash);
        
        if (!txInfo) {
            return { valid: false, error: 'المعاملة غير موجودة' };
        }
        
        console.log('📋 Transaction found:', JSON.stringify(txInfo, null, 2));
        
        // 🔒 التحقق 1: هل الـ value موجود مباشرة؟ (Native TON)
        // العملات الوهمية (Jetton) بيبقى value = 0 أو صغير جداً
        const value = parseInt(txInfo.in_msg?.value || 0);
        
        if (value === 0) {
            console.error('🚨 FAKE TOKEN: value = 0 (probably Jetton)');
            return { 
                valid: false, 
                error: 'عملة مزيفة! يُسمح فقط بـ TON الأصلي',
                details: { reason: 'zero_value', hint: 'Jetton transfer detected' }
            };
        }
        
        // 🔒 التحقق 2: المبلغ يكفي؟
        const expectedNano = Math.floor(parseFloat(expectedAmount) * 1e9);
        
        if (value < expectedNano) {
            return { 
                valid: false, 
                error: 'المبلغ غير كافٍ',
                details: { expected: expectedNano, received: value }
            };
        }
        
        // 🔒 التحقق 3: المرسل صحيح؟
        if (txInfo.in_msg?.source !== expectedSender) {
            return { 
                valid: false, 
                error: 'المرسل لا يتطابق',
                details: { expected: expectedSender, received: txInfo.in_msg?.source }
            };
        }
        
        // 🔒 التحقق 4: المستلم هو محفظتك؟
        if (txInfo.in_msg?.destination !== TON_CONFIG.RECEIVER_WALLET) {
            return { 
                valid: false, 
                error: 'جهة الاستلام غير صحيحة',
                details: { expected: TON_CONFIG.RECEIVER_WALLET, received: txInfo.in_msg?.destination }
            };
        }
        
        // ✅ نجح
        return {
            valid: true,
            txHash: txHash,
            amount: value,
            sender: txInfo.in_msg.source,
            destination: txInfo.in_msg.destination
        };
        
    } catch (error) {
        console.error('❌ Verification error:', error);
        return { valid: false, error: 'خطأ في التحقق: ' + error.message };
    }
}

/**
 * جلب المعاملة من TON Center
 */
async function getTransactionInfo(txHash) {
    try {
        // نستخدم getTransactions بالعنوان
        const url = `${TON_CONFIG.RPC_ENDPOINT}/getTransactions`;
        
        const params = {
            address: TON_CONFIG.RECEIVER_WALLET,
            limit: 20,
            archival: true
        };
        
        if (TON_CONFIG.API_KEY) {
            params.api_key = TON_CONFIG.API_KEY;
        }
        
        console.log('🔍 Fetching from:', url);
        console.log('📍 Address:', TON_CONFIG.RECEIVER_WALLET);
        
        const response = await axios.get(url, { params, timeout: 10000 });
        
        if (response.data?.ok && response.data?.result) {
            // البحث عن المعاملة
            const tx = response.data.result.find(t => {
                // البحث بالهاش المختلفة
                const hashes = [
                    t.transaction_id?.hash,
                    t.in_msg?.body_hash,
                    t.in_msg?.hash
                ].filter(Boolean);
                
                // مقارنة الهاشات
                return hashes.some(h => 
                    h.toLowerCase().includes(txHash.toLowerCase()) || 
                    txHash.toLowerCase().includes(h.toLowerCase())
                );
            });
            
            return tx || null;
        }
        
        return null;
    } catch (error) {
        console.error('❌ Error fetching transaction:', error.message);
        return null;
    }
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

// 4. Create Order (Stars)
app.post('/api/order/stars', async (req, res) => {
    const { user_id, recipient, amount, ton_amount, wallet_address } = req.body;
    const orderId = 'STAR_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    
    if (!user_id || !recipient || !amount) {
        return response(res, false, 'بيانات غير مكتملة');
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

// 5. Create Order (Premium)
app.post('/api/order/premium', async (req, res) => {
    const { user_id, recipient, plan, ton_amount, wallet_address } = req.body;
    const orderId = 'PRM_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    
    if (!user_id || !recipient || !plan) {
        return response(res, false, 'بيانات غير مكتملة');
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

// 6. 🔒 VERIFY PAYMENT - التحقق من الدفع
app.post('/api/verify-payment', async (req, res) => {
    const { order_id, tx_hash, wallet_address, order_type } = req.body;
    
    if (!order_id || !tx_hash || !wallet_address) {
        return response(res, false, 'بيانات التحقق غير مكتملة');
    }
    
    console.log(`🔒 Verifying payment for order: ${order_id}`);
    console.log(`📋 TX Hash: ${tx_hash}`);
    
    try {
        // جلب تفاصيل الأوردر
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
        
        // 🔍 التحقق من المعاملة
        const verification = await verifyTONTransaction(tx_hash, wallet_address, order.ton_amount);
        
        // حفظ نتيجة التحقق
        await db.execute(
            'INSERT INTO payment_verifications (order_id, tx_hash, status, details) VALUES (?, ?, ?, ?)',
            [order_id, tx_hash, verification.valid ? 'confirmed' : 'rejected', JSON.stringify(verification)]
        );
        
        if (!verification.valid) {
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
        
        // ✅ نجح
        console.log('✅ Payment verified!');
        
        const table = order_type === 'stars' ? 'stars_orders' : 'premium_orders';
        await db.execute(
            `UPDATE ${table} SET status = 'paid', tx_hash = ?, paid_at = NOW() WHERE order_id = ?`,
            [tx_hash, order_id]
        );
        
        response(res, true, 'تم التحقق من الدفع بنجاح', {
            verified: true,
            tx_hash: tx_hash,
            amount: verification.amount
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
    response(res, true, 'Server running with TON verification');
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`🔒 TON Fake Token Protection: ENABLED`);
    console.log(`💰 Receiver Wallet: ${TON_CONFIG.RECEIVER_WALLET}`);
});
