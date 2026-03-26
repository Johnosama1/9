// ============================================
// starGo - Node.js Server (all code in one file)
// ============================================

const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Database config
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
// TON PAYMENT VERIFICATION FUNCTIONS
// ============================================

// التحقق من صحة عنوان TON
function isValidTonAddress(address) {
    // TON addresses start with EQ or UQ and are 48 characters long
    const tonAddressRegex = /^(EQ|UQ)[a-zA-Z0-9_-]{46}$/;
    return tonAddressRegex.test(address);
}

// التحقق من وجود المعاملة على البلوكتشين
async function verifyTonTransaction(txHash, expectedAmount, recipientAddress) {
    try {
        // استخدام TON Center API للتحقق من المعاملة
        const tonCenterApi = 'https://toncenter.com/api/v2';
        
        // جلب معلومات المعاملة
        const txResponse = await fetch(`${tonCenterApi}/getTransactions?hash=${txHash}&limit=1`);
        const txData = await txResponse.json();
        
        if (!txData.ok || !txData.result || txData.result.length === 0) {
            return { 
                valid: false, 
                reason: 'المعاملة غير موجودة على البلوكتشين' 
            };
        }
        
        const transaction = txData.result[0];
        
        // التحقق من حالة المعاملة
        if (transaction.out_msgs && transaction.out_msgs.length > 0) {
            const outMsg = transaction.out_msgs[0];
            
            // التحقق من العنوان المستلم
            const txRecipient = outMsg.destination;
            if (txRecipient !== recipientAddress) {
                return { 
                    valid: false, 
                    reason: 'عنوان المستلم غير صحيح' 
                };
            }
            
            // التحقق من المبلغ (بالنانو TON)
            const txAmount = parseInt(outMsg.value);
            const expectedNanoTon = Math.floor(expectedAmount * 1000000000); // تحويل TON لنانو TON
            
            // السماح بفرق 1% بسبب رسوم الشبكة
            const tolerance = expectedNanoTon * 0.01;
            
            if (Math.abs(txAmount - expectedNanoTon) > tolerance) {
                return { 
                    valid: false, 
                    reason: `المبلغ غير صحيح. المتوقع: ${expectedAmount} TON، المستلم: ${(txAmount / 1000000000).toFixed(4)} TON` 
                };
            }
            
            // التحقق من وقت المعاملة (ما تكونش أقدم من ساعة)
            const txTime = transaction.utime * 1000; // convert to milliseconds
            const now = Date.now();
            const oneHour = 60 * 60 * 1000;
            
            if (now - txTime > oneHour) {
                return { 
                    valid: false, 
                    reason: 'المعاملة قديمة جداً (أكثر من ساعة)' 
                };
            }
            
            return { 
                valid: true, 
                transaction: {
                    hash: txHash,
                    amount: txAmount / 1000000000,
                    recipient: txRecipient,
                    time: new Date(txTime).toISOString()
                }
            };
        }
        
        return { 
            valid: false, 
            reason: 'بيانات المعاملة غير صحيحة' 
        };
        
    } catch (error) {
        console.error('TON Verification Error:', error);
        return { 
            valid: false, 
            reason: 'خطأ في التحقق من البلوكتشين: ' + error.message 
        };
    }
}

// التحقق من عدم استخدام نفس المعاملة مرتين
async function isTransactionUsed(txHash) {
    try {
        const [rows] = await db.execute(
            'SELECT id FROM payment_verifications WHERE tx_hash = ? AND status = "confirmed"',
            [txHash]
        );
        return rows.length > 0;
    } catch (error) {
        console.error('Database Error:', error);
        return true; // في حالة الخطأ، نعتبرها مستخدمة للأمان
    }
}

// حفظ نتيجة التحقق في قاعدة البيانات
async function saveVerificationResult(orderId, txHash, status, details) {
    try {
        await db.execute(
            'INSERT INTO payment_verifications (order_id, tx_hash, status, details, verified_at) VALUES (?, ?, ?, ?, NOW())',
            [orderId, txHash, status, JSON.stringify(details)]
        );
    } catch (error) {
        console.error('Error saving verification:', error);
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
    
    // التحقق من صحة عنوان TON
    if (!isValidTonAddress(wallet_address)) {
        return response(res, false, 'عنوان TON غير صحيح. يجب أن يبدأ بـ EQ أو UQ ويكون 48 حرف');
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

// 4. Create Order (Stars) - مع التحقق من الدفع
app.post('/api/order/stars', async (req, res) => {
    const { user_id, recipient, amount, ton_amount, tx_hash, sender_wallet } = req.body;
    const orderId = 'STAR_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    
    if (!user_id || !recipient || !amount) {
        return response(res, false, 'بيانات غير مكتملة');
    }
    
    // ⚠️ التحقق من الدفع إذا تم إرسال معاملة
    if (tx_hash) {
        // التحقق من عدم استخدام المعاملة من قبل
        const used = await isTransactionUsed(tx_hash);
        if (used) {
            return response(res, false, 'هذه المعاملة مستخدمة من قبل!');
        }
        
        // عنوان محفظتك (استبدله بعنوانك الحقيقي)
        const YOUR_WALLET_ADDRESS = 'EQxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'; // ⚠️ ضع عنوانك هنا
        
        // التحقق من المعاملة على البلوكتشين
        const verification = await verifyTonTransaction(tx_hash, ton_amount, YOUR_WALLET_ADDRESS);
        
        if (!verification.valid) {
            await saveVerificationResult(orderId, tx_hash, 'rejected', { reason: verification.reason });
            return response(res, false, `فشل التحقق: ${verification.reason}`);
        }
        
        // حفظ نتيجة التحقق الناجح
        await saveVerificationResult(orderId, tx_hash, 'confirmed', verification.transaction);
    }
    
    try {
        await db.execute(
            'INSERT INTO stars_orders (user_id, recipient_username, stars_amount, ton_amount, order_id, status, tx_hash) VALUES (?, ?, ?, ?, ?, "pending", ?)',
            [user_id, recipient, amount, ton_amount, orderId, tx_hash || null]
        );
        response(res, true, 'تم إنشاء الطلب', { order_id: orderId });
    } catch (error) {
        response(res, false, 'خطأ في إنشاء الطلب');
    }
});

// 5. Create Order (Premium) - مع التحقق من الدفع
app.post('/api/order/premium', async (req, res) => {
    const { user_id, recipient, plan, ton_amount, tx_hash, sender_wallet } = req.body;
    const orderId = 'PRM_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    
    if (!user_id || !recipient || !plan) {
        return response(res, false, 'بيانات غير مكتملة');
    }
    
    // ⚠️ التحقق من الدفع إذا تم إرسال معاملة
    if (tx_hash) {
        // التحقق من عدم استخدام المعاملة من قبل
        const used = await isTransactionUsed(tx_hash);
        if (used) {
            return response(res, false, 'هذه المعاملة مستخدمة من قبل!');
        }
        
        // عنوان محفظتك (استبدله بعنوانك الحقيقي)
        const YOUR_WALLET_ADDRESS = 'EQxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'; // ⚠️ ضع عنوانك هنا
        
        // التحقق من المعاملة على البلوكتشين
        const verification = await verifyTonTransaction(tx_hash, ton_amount, YOUR_WALLET_ADDRESS);
        
        if (!verification.valid) {
            await saveVerificationResult(orderId, tx_hash, 'rejected', { reason: verification.reason });
            return response(res, false, `فشل التحقق: ${verification.reason}`);
        }
        
        // حفظ نتيجة التحقق الناجح
        await saveVerificationResult(orderId, tx_hash, 'confirmed', verification.transaction);
    }
    
    try {
        await db.execute(
            'INSERT INTO premium_orders (user_id, recipient_username, plan_name, ton_amount, order_id, status, tx_hash) VALUES (?, ?, ?, ?, ?, "pending", ?)',
            [user_id, recipient, plan, ton_amount, orderId, tx_hash || null]
        );
        response(res, true, 'تم إنشاء الطلب', { order_id: orderId });
    } catch (error) {
        response(res, false, 'خطأ في إنشاء الطلب');
    }
});

// 6. Verify Payment Manually (للتحقق اليدوي من الدفع)
app.post('/api/verify-payment', async (req, res) => {
    const { order_id, tx_hash, ton_amount } = req.body;
    
    if (!order_id || !tx_hash) {
        return response(res, false, 'رقم الطلب ومعرف المعاملة مطلوبان');
    }
    
    // التحقق من عدم استخدام المعاملة من قبل
    const used = await isTransactionUsed(tx_hash);
    if (used) {
        return response(res, false, 'هذه المعاملة مستخدمة من قبل!');
    }
    
    // عنوان محفظتك
    const YOUR_WALLET_ADDRESS = 'EQxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'; // ⚠️ ضع عنوانك هنا
    
    const verification = await verifyTonTransaction(tx_hash, ton_amount, YOUR_WALLET_ADDRESS);
    
    if (!verification.valid) {
        await saveVerificationResult(order_id, tx_hash, 'rejected', { reason: verification.reason });
        return response(res, false, `فشل التحقق: ${verification.reason}`);
    }
    
    // تحديث حالة الطلب
    try {
        let [result] = await db.execute(
            'UPDATE stars_orders SET status = "paid", tx_hash = ?, paid_at = NOW() WHERE order_id = ?',
            [tx_hash, order_id]
        );
        
        if (result.affectedRows === 0) {
            [result] = await db.execute(
                'UPDATE premium_orders SET status = "paid", tx_hash = ?, paid_at = NOW() WHERE order_id = ?',
                [tx_hash, order_id]
            );
        }
        
        await saveVerificationResult(order_id, tx_hash, 'confirmed', verification.transaction);
        
        response(res, true, 'تم التحقق من الدفع بنجاح', verification.transaction);
    } catch (error) {
        response(res, false, 'خطأ في تحديث الطلب');
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
    response(res, true, 'Server is running');
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📡 API endpoints:`);
    console.log(`   GET  /api/price`);
    console.log(`   POST /api/login`);
    console.log(`   POST /api/wallet`);
    console.log(`   POST /api/order/stars`);
    console.log(`   POST /api/order/premium`);
    console.log(`   POST /api/verify-payment`);
    console.log(`   PUT  /api/order/:orderId`);
    console.log(`   GET  /api/orders/:userId`);
    console.log(`   GET  /api/stats`);
    console.log(`   GET  /api/admin/orders`);
    console.log(`   GET  /api/admin/users`);
});
