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
    const { user_id, recipient, amount, ton_amount } = req.body;
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
    const { user_id, recipient, plan, ton_amount } = req.body;
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

// 6. Update Order Status
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

// 7. Get User Orders
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

// 8. Get Statistics
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

// 9. Get All Orders (Admin)
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

// 10. Get All Users (Admin)
app.get('/api/admin/users', async (req, res) => {
    try {
        const [users] = await db.execute('SELECT id, telegram_username, wallet_address, login_count, last_login, created_at FROM users ORDER BY created_at DESC LIMIT 100');
        response(res, true, 'تم جلب المستخدمين', users);
    } catch (error) {
        response(res, false, 'خطأ في جلب المستخدمين');
    }
});

// 11. Health Check
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
    console.log(`   PUT  /api/order/:orderId`);
    console.log(`   GET  /api/orders/:userId`);
    console.log(`   GET  /api/stats`);
    console.log(`   GET  /api/admin/orders`);
    console.log(`   GET  /api/admin/users`);
});