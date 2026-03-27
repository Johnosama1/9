// ============================================
// starGo - Vercel Serverless API
// ============================================

const mysql = require('mysql2/promise');

// ⚠️ عنوان محفظتك اللي هتستلم عليها الفلوس
const RECEIVER_WALLET = "UQBPpnRDUyTVXzJk4Qxr02z4iPFZfWv8NC2fvOjHe8UtmpHE";

// Database config
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'stargo_db'
};

let db = null;

// Database connection
async function connectDB() {
    if (db) return db;
    try {
        db = await mysql.createConnection(dbConfig);
        console.log('✅ Database connected');
        return db;
    } catch (error) {
        console.error('❌ Database error:', error.message);
        throw error;
    }
}

// Helper function
function sendResponse(res, success, message, data = null) {
    res.status(200).json({ success, message, data });
}

// CORS headers
function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// ============================================
// TON PAYMENT VERIFICATION FUNCTIONS
// ============================================

function isValidTonAddress(address) {
    const tonAddressRegex = /^(EQ|UQ)[a-zA-Z0-9_-]{46}$/;
    return tonAddressRegex.test(address);
}

async function verifyTonTransaction(txHash, expectedAmount, recipientAddress) {
    try {
        const tonCenterApi = 'https://toncenter.com/api/v2';
        const txResponse = await fetch(`${tonCenterApi}/getTransactions?hash=${txHash}&limit=1`);
        const txData = await txResponse.json();
        
        if (!txData.ok || !txData.result || txData.result.length === 0) {
            return { valid: false, reason: 'المعاملة غير موجودة على البلوكتشين' };
        }
        
        const transaction = txData.result[0];
        
        if (transaction.out_msgs && transaction.out_msgs.length > 0) {
            const outMsg = transaction.out_msgs[0];
            const txRecipient = outMsg.destination;
            
            if (txRecipient !== recipientAddress) {
                return { valid: false, reason: 'عنوان المستلم غير صحيح' };
            }
            
            const txAmount = parseInt(outMsg.value);
            const expectedNanoTon = Math.floor(expectedAmount * 1000000000);
            const tolerance = expectedNanoTon * 0.01;
            
            if (Math.abs(txAmount - expectedNanoTon) > tolerance) {
                return { valid: false, reason: `المبلغ غير صحيح. المتوقع: ${expectedAmount} TON، المستلم: ${(txAmount / 1000000000).toFixed(4)} TON` };
            }
            
            const txTime = transaction.utime * 1000;
            const now = Date.now();
            const oneHour = 60 * 60 * 1000;
            
            if (now - txTime > oneHour) {
                return { valid: false, reason: 'المعاملة قديمة جداً (أكثر من ساعة)' };
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
        
        return { valid: false, reason: 'بيانات المعاملة غير صحيحة' };
        
    } catch (error) {
        console.error('TON Verification Error:', error);
        return { valid: false, reason: 'خطأ في التحقق من البلوكتشين: ' + error.message };
    }
}

async function isTransactionUsed(txHash, db) {
    try {
        const [rows] = await db.execute(
            'SELECT id FROM payment_verifications WHERE tx_hash = ? AND status = "confirmed"',
            [txHash]
        );
        return rows.length > 0;
    } catch (error) {
        console.error('Database Error:', error);
        return true;
    }
}

async function saveVerificationResult(orderId, txHash, status, details, db) {
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
// API ROUTES HANDLER
// ============================================

module.exports = async (req, res) => {
    setCorsHeaders(res);
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { pathname } = new URL(req.url, `http://${req.headers.host}`);
    
    try {
        const db = await connectDB();
        
        // 1. Get TON Price
        if (pathname === '/api/price' && req.method === 'GET') {
            try {
                const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=toncoin&vs_currencies=usd');
                const data = await response.json();
                return sendResponse(res, true, 'Price fetched', { price: data.toncoin.usd });
            } catch (error) {
                return sendResponse(res, true, 'Using fallback price', { price: 5.5 });
            }
        }
        
        // 2. Connect Wallet
        if (pathname === '/api/wallet' && req.method === 'POST') {
            const { wallet_address, user_id } = req.body;
            
            if (!wallet_address) {
                return sendResponse(res, false, 'عنوان المحفظة مطلوب');
            }
            
            if (!isValidTonAddress(wallet_address)) {
                return sendResponse(res, false, 'عنوان TON غير صحيح. يجب أن يبدأ بـ EQ أو UQ ويكون 48 حرف');
            }
            
            try {
                if (user_id) {
                    await db.execute('UPDATE users SET wallet_address = ?, wallet_connected_at = NOW() WHERE id = ?', [wallet_address, user_id]);
                }
                return sendResponse(res, true, 'تم ربط المحفظة');
            } catch (error) {
                return sendResponse(res, false, 'خطأ في الحفظ');
            }
        }
        
        // 3. Login / Save User
        if (pathname === '/api/login' && req.method === 'POST') {
            const { username } = req.body;
            const cleanUsername = username?.replace('@', '');
            
            if (!cleanUsername) {
                return sendResponse(res, false, 'اسم المستخدم مطلوب');
            }
            
            try {
                const [users] = await db.execute('SELECT id FROM users WHERE telegram_username = ?', [cleanUsername]);
                
                if (users.length > 0) {
                    await db.execute('UPDATE users SET last_login = NOW(), login_count = login_count + 1 WHERE id = ?', [users[0].id]);
                    return sendResponse(res, true, 'تم تسجيل الدخول', { user_id: users[0].id, username: '@' + cleanUsername });
                } else {
                    const [result] = await db.execute('INSERT INTO users (telegram_username, first_login, last_login) VALUES (?, NOW(), NOW())', [cleanUsername]);
                    return sendResponse(res, true, 'تم إنشاء حساب', { user_id: result.insertId, username: '@' + cleanUsername });
                }
            } catch (error) {
                return sendResponse(res, false, 'خطأ في قاعدة البيانات');
            }
        }
        
        // 4. Create Order (Stars)
        if (pathname === '/api/order/stars' && req.method === 'POST') {
            const { user_id, recipient, amount, ton_amount, tx_hash } = req.body;
            const orderId = 'STAR_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
            
            if (!user_id || !recipient || !amount) {
                return sendResponse(res, false, 'بيانات غير مكتملة');
            }
            
            if (tx_hash) {
                const used = await isTransactionUsed(tx_hash, db);
                if (used) {
                    return sendResponse(res, false, 'هذه المعاملة مستخدمة من قبل!');
                }
                
                const verification = await verifyTonTransaction(tx_hash, ton_amount, RECEIVER_WALLET);
                
                if (!verification.valid) {
                    await saveVerificationResult(orderId, tx_hash, 'rejected', { reason: verification.reason }, db);
                    return sendResponse(res, false, `فشل التحقق: ${verification.reason}`);
                }
                
                await saveVerificationResult(orderId, tx_hash, 'confirmed', verification.transaction, db);
            }
            
            try {
                await db.execute(
                    'INSERT INTO stars_orders (user_id, recipient_username, stars_amount, ton_amount, order_id, status, tx_hash) VALUES (?, ?, ?, ?, ?, "pending", ?)',
                    [user_id, recipient, amount, ton_amount, orderId, tx_hash || null]
                );
                return sendResponse(res, true, 'تم إنشاء الطلب', { order_id: orderId });
            } catch (error) {
                return sendResponse(res, false, 'خطأ في إنشاء الطلب');
            }
        }
        
        // 5. Create Order (Premium)
        if (pathname === '/api/order/premium' && req.method === 'POST') {
            const { user_id, recipient, plan, ton_amount, tx_hash } = req.body;
            const orderId = 'PRM_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
            
            if (!user_id || !recipient || !plan) {
                return sendResponse(res, false, 'بيانات غير مكتملة');
            }
            
            if (tx_hash) {
                const used = await isTransactionUsed(tx_hash, db);
                if (used) {
                    return sendResponse(res, false, 'هذه المعاملة مستخدمة من قبل!');
                }
                
                const verification = await verifyTonTransaction(tx_hash, ton_amount, RECEIVER_WALLET);
                
                if (!verification.valid) {
                    await saveVerificationResult(orderId, tx_hash, 'rejected', { reason: verification.reason }, db);
                    return sendResponse(res, false, `فشل التحقق: ${verification.reason}`);
                }
                
                await saveVerificationResult(orderId, tx_hash, 'confirmed', verification.transaction, db);
            }
            
            try {
                await db.execute(
                    'INSERT INTO premium_orders (user_id, recipient_username, plan_name, ton_amount, order_id, status, tx_hash) VALUES (?, ?, ?, ?, ?, "pending", ?)',
                    [user_id, recipient, plan, ton_amount, orderId, tx_hash || null]
                );
                return sendResponse(res, true, 'تم إنشاء الطلب', { order_id: orderId });
            } catch (error) {
                return sendResponse(res, false, 'خطأ في إنشاء الطلب');
            }
        }
        
        // 6. Verify Payment Manually
        if (pathname === '/api/verify-payment' && req.method === 'POST') {
            const { order_id, tx_hash, ton_amount } = req.body;
            
            if (!order_id || !tx_hash) {
                return sendResponse(res, false, 'رقم الطلب ومعرف المعاملة مطلوبان');
            }
            
            const used = await isTransactionUsed(tx_hash, db);
            if (used) {
                return sendResponse(res, false, 'هذه المعاملة مستخدمة من قبل!');
            }
            
            const verification = await verifyTonTransaction(tx_hash, ton_amount, RECEIVER_WALLET);
            
            if (!verification.valid) {
                await saveVerificationResult(order_id, tx_hash, 'rejected', { reason: verification.reason }, db);
                return sendResponse(res, false, `فشل التحقق: ${verification.reason}`);
            }
            
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
                
                await saveVerificationResult(order_id, tx_hash, 'confirmed', verification.transaction, db);
                
                return sendResponse(res, true, 'تم التحقق من الدفع بنجاح', verification.transaction);
            } catch (error) {
                return sendResponse(res, false, 'خطأ في تحديث الطلب');
            }
        }
        
        // 7. Update Order Status
        if (pathname.startsWith('/api/order/') && req.method === 'PUT') {
            const orderId = pathname.split('/')[3];
            const { status } = req.body;
            
            try {
                let [result] = await db.execute('UPDATE stars_orders SET status = ?, completed_at = NOW() WHERE order_id = ?', [status, orderId]);
                
                if (result.affectedRows === 0) {
                    [result] = await db.execute('UPDATE premium_orders SET status = ?, completed_at = NOW() WHERE order_id = ?', [status, orderId]);
                }
                
                return sendResponse(res, true, 'تم تحديث الحالة');
            } catch (error) {
                return sendResponse(res, false, 'خطأ في التحديث');
            }
        }
        
        // 8. Get User Orders
        if (pathname.startsWith('/api/orders/') && req.method === 'GET') {
            const userId = pathname.split('/')[3];
            
            try {
                const [stars] = await db.execute('SELECT order_id, stars_amount, status, created_at FROM stars_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', [userId]);
                const [premium] = await db.execute('SELECT order_id, plan_name, status, created_at FROM premium_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', [userId]);
                
                return sendResponse(res, true, 'تم جلب الطلبات', { stars, premium });
            } catch (error) {
                return sendResponse(res, false, 'خطأ في جلب الطلبات');
            }
        }
        
        // 9. Get Statistics
        if (pathname === '/api/stats' && req.method === 'GET') {
            try {
                const [totalUsers] = await db.execute('SELECT COUNT(*) as total FROM users');
                const [pendingStars] = await db.execute('SELECT COUNT(*) as total FROM stars_orders WHERE status = "pending"');
                const [pendingPremium] = await db.execute('SELECT COUNT(*) as total FROM premium_orders WHERE status = "pending"');
                const [todayOrders] = await db.execute('SELECT COUNT(*) as total FROM stars_orders WHERE DATE(created_at) = CURDATE()');
                
                return sendResponse(res, true, 'تم جلب الإحصائيات', {
                    total_users: totalUsers[0].total,
                    pending_stars: pendingStars[0].total,
                    pending_premium: pendingPremium[0].total,
                    today_orders: todayOrders[0].total
                });
            } catch (error) {
                return sendResponse(res, false, 'خطأ في جلب الإحصائيات');
            }
        }
        
        // 10. Get All Orders (Admin)
        if (pathname === '/api/admin/orders' && req.method === 'GET') {
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
                
                return sendResponse(res, true, 'تم جلب الطلبات', { stars, premium });
            } catch (error) {
                return sendResponse(res, false, 'خطأ في جلب الطلبات');
            }
        }
        
        // 11. Get All Users (Admin)
        if (pathname === '/api/admin/users' && req.method === 'GET') {
            try {
                const [users] = await db.execute('SELECT id, telegram_username, wallet_address, login_count, last_login, created_at FROM users ORDER BY created_at DESC LIMIT 100');
                return sendResponse(res, true, 'تم جلب المستخدمين', users);
            } catch (error) {
                return sendResponse(res, false, 'خطأ في جلب المستخدمين');
            }
        }
        
        // 12. Health Check
        if (pathname === '/api/health' && req.method === 'GET') {
            return sendResponse(res, true, 'Server is running');
        }
        
        // 404 for unknown routes
        return res.status(404).json({ success: false, message: 'API endpoint not found' });
        
    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
    }
};