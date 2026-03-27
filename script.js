/* ============================================================
   starGo - Final Version with TON Fake Token Protection
============================================================ */

const RECEIVER_WALLET = "UQBPpnRDUyTVXzJk4Qxr02z4iPFZfWv8NC2fvOjHe8UtmpHE";
const API_URL = 'http://localhost:3000/api';

window.tonPrice = null;
const FIXED_FEE = 0.20;
let tonConnectUI = null;
let currentOrder = null;

/* ============================================================
   Helper Functions
============================================================ */

function toNano(tonAmount) {
    return String(Math.floor(Number(tonAmount) * 1e9));
}

function base64Encode(str) {
    try {
        return btoa(str);
    } catch (e) {
        return btoa(unescape(encodeURIComponent(str)));
    }
}

function getFormattedDate() {
    const date = new Date();
    return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()} ${date.getHours()}:${date.getMinutes()}`;
}

function showNotification(message, type = 'success') {
    const oldNotification = document.querySelector('.notification');
    if (oldNotification) oldNotification.remove();
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-check-circle';
    if (type === 'error') icon = 'fa-exclamation-circle';
    if (type === 'warning') icon = 'fa-exclamation-triangle';
    
    notification.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideUp 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

/* ============================================================
   TON Connect UI
============================================================ */

function initTonConnect() {
    console.log('🔄 Initializing TON Connect...');
    
    if (typeof window.TON_CONNECT_UI === 'undefined') {
        console.warn('TON Connect UI not loaded, retrying...');
        setTimeout(initTonConnect, 1000);
        return;
    }
    
    try {
        const manifestUrl = 'https://' + window.location.hostname + '/tonconnect-manifest.json';
        console.log('🔗 Manifest:', manifestUrl);
        
        tonConnectUI = new window.TON_CONNECT_UI.TonConnectUI({
            manifestUrl: manifestUrl
        });
        
        console.log('✅ TON Connect initialized');
        
        tonConnectUI.onStatusChange((wallet) => {
            if (wallet) {
                console.log('✅ Wallet connected:', wallet.account.address);
                updateWalletUI(wallet);
                showNotification('✅ تم ربط المحفظة بنجاح', 'success');
            } else {
                console.log('❌ Wallet disconnected');
                document.getElementById('walletInfo').style.display = 'none';
                document.getElementById('connectTonWalletBtn').style.display = 'block';
            }
        });
        
    } catch (e) {
        console.error('❌ Error:', e);
        showNotification('❌ خطأ في تهيئة TON Connect', 'error');
    }
}

function updateWalletUI(wallet) {
    if (!wallet || !wallet.account) return;
    
    document.getElementById('walletAddress').value = wallet.account.address;
    document.getElementById('walletProvider').value = wallet.device?.appName || 'tonconnect';
    
    const short = wallet.account.address.substring(0, 6) + '...' + 
                  wallet.account.address.substring(wallet.account.address.length - 4);
    document.getElementById('connectedAddress').textContent = short;
    
    document.getElementById('walletInfo').style.display = 'block';
    document.getElementById('connectTonWalletBtn').style.display = 'none';
    
    fetchWalletBalance(wallet.account.address);
}

async function fetchWalletBalance(address) {
    try {
        const res = await fetch(`https://toncenter.com/api/v2/getAddressBalance?address=${address}`);
        const data = await res.json();
        if (data.ok) {
            const balance = (data.result / 1e9).toFixed(2);
            document.getElementById('balanceAmount').textContent = balance;
            document.getElementById('walletBalance').style.display = 'flex';
        }
    } catch (e) {
        console.warn('Balance fetch error:', e);
    }
}

/* ============================================================
   Wallet Connection
============================================================ */

async function connectTonWallet() {
    console.log('🔘 Connect clicked - closing sidebar first');
    
    closeSidebar();
    await new Promise(resolve => setTimeout(resolve, 300));
    
    if (!tonConnectUI) {
        showNotification('🔄 جاري التحميل...', 'warning');
        return;
    }
    
    try {
        await tonConnectUI.openModal();
    } catch (e) {
        console.error('❌ Error opening modal:', e);
        showNotification('❌ فشل فتح المحفظة', 'error');
    }
}

async function disconnectWallet() {
    if (!tonConnectUI) return;
    
    try {
        await tonConnectUI.disconnect();
        showNotification('✅ تم قطع الاتصال', 'success');
    } catch (e) {
        console.error('Error:', e);
    }
}

function checkWalletBeforePurchase() {
    const walletAddress = document.getElementById('walletAddress').value;
    const walletInfo = document.getElementById('walletInfo');
    
    if (!walletAddress || walletInfo.style.display === 'none') {
        showNotification('⚠️ يجب ربط المحفظة أولاً', 'warning');
        
        document.getElementById('sidebar').classList.add('open');
        document.getElementById('overlay').style.display = 'block';
        
        setTimeout(() => connectTonWallet(), 500);
        return false;
    }
    return true;
}

/* ============================================================
   Sidebar & UI
============================================================ */

function toggleSidebar() {
    const sb = document.getElementById("sidebar");
    const ov = document.getElementById("overlay");
    
    if (sb.classList.contains("open")) {
        closeSidebar();
    } else {
        sb.classList.add("open");
        ov.style.display = "block";
        document.body.style.overflow = 'hidden';
    }
}

function closeSidebar() {
    const sb = document.getElementById("sidebar");
    const ov = document.getElementById("overlay");
    
    sb.classList.remove("open");
    ov.style.display = "none";
    document.body.style.overflow = '';
    
    console.log('✅ Sidebar closed');
}

function switchTab(tab) {
    document.querySelectorAll(".tab-btn").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".content-box").forEach(c => c.style.display = "none");
    
    if (tab === 'stars') {
        document.querySelectorAll(".tab-btn")[0].classList.add("active");
        document.getElementById("stars-content").style.display = "block";
    } else {
        document.querySelectorAll(".tab-btn")[1].classList.add("active");
        document.getElementById("premium-content").style.display = "block";
    }
}

/* ============================================================
   User Functions
============================================================ */

function checkUser() {
    let user = document.getElementById("username-input").value.trim();
    if (!user) return showNotification("ادخل يوزر التليجرام", 'error');
    if (!user.startsWith("@")) user = "@" + user;
    
    document.getElementById("user-name").innerText = user;
    document.getElementById("user-card").style.display = "flex";
    document.getElementById("user-input-container").style.display = "none";
}

function removeUser() {
    document.getElementById("user-card").style.display = "none";
    document.getElementById("user-input-container").style.display = "flex";
    document.getElementById("username-input").value = "";
}

function checkPremiumUser() {
    let user = document.getElementById("premium-username-input").value.trim();
    if (!user) return showNotification("ادخل يوزر التليجرام", 'error');
    if (!user.startsWith("@")) user = "@" + user;
    
    document.getElementById("premium-user-name").innerText = user;
    document.getElementById("premium-user-card").style.display = "flex";
    document.getElementById("premium-user-input-container").style.display = "none";
}

function removePremiumUser() {
    document.getElementById("premium-user-card").style.display = "none";
    document.getElementById("premium-user-input-container").style.display = "flex";
    document.getElementById("premium-username-input").value = "";
}

function selectPackage(amount, ton) {
    document.querySelectorAll(".package").forEach(p => p.classList.remove("active-package"));
    event.currentTarget.classList.add("active-package");
    
    document.getElementById("pack-" + amount).checked = true;
    document.getElementById("stars-amount").value = amount;
    calculateStars();
}

function selectPremiumPlan(ton, name) {
    document.querySelectorAll(".plan").forEach(p => p.classList.remove("active-plan"));
    event.currentTarget.classList.add("active-plan");
    
    const radio = event.currentTarget.querySelector("input");
    if (radio) radio.checked = true;
}

/* ============================================================
   Prices
============================================================ */

async function fetchTonPrice() {
    try {
        const res = await fetch("https://api.coinbase.com/v2/exchange-rates?currency=TON");
        const data = await res.json();
        window.tonPrice = parseFloat(data.data.rates.USD);
        updatePrices();
    } catch (e) {
        console.error("Price fetch error:", e);
        window.tonPrice = 5.5;
        updatePrices();
    }
}

function updatePrices() {
    if (!window.tonPrice) return;
    
    document.querySelectorAll(".package").forEach(pkg => {
        const ton = parseFloat(pkg.getAttribute("data-ton"));
        const usd = (ton * window.tonPrice + FIXED_FEE).toFixed(2);
        const el = pkg.querySelector(".pack-usd");
        if (el) el.innerText = "~ $" + usd;
    });
    
    document.querySelectorAll(".plan").forEach(plan => {
        const ton = parseFloat(plan.getAttribute("data-ton"));
        const usd = (ton * window.tonPrice + FIXED_FEE).toFixed(2);
        const el = plan.querySelector(".usd-value");
        if (el) el.innerText = "~ $" + usd;
    });
}

function calculateStars() {
    const amount = Number(document.getElementById("stars-amount").value);
    const out = document.getElementById("calc-result");
    
    if (!amount || amount < 50 || !window.tonPrice) {
        out.innerHTML = "";
        return;
    }
    
    const TON_PER_STAR = 0.0099273;
    const ton = amount * TON_PER_STAR;
    const usd = (ton * window.tonPrice + FIXED_FEE).toFixed(2);
    
    out.innerHTML = `<b style="color:#4dd0ff">$${usd}</b> for <b>${amount} ⭐</b>`;
}

/* ============================================================
   Purchase with Anti-Fake Protection
============================================================ */

async function createOrder(type, data) {
    try {
        const endpoint = type === 'stars' ? '/order/stars' : '/order/premium';
        const response = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('Create order error:', error);
        return { success: false, message: 'خطأ في إنشاء الطلب' };
    }
}

async function verifyPayment(orderId, txHash, walletAddress, orderType) {
    try {
        showNotification('🔍 جاري التحقق من صحة العملة...', 'warning');
        
        const response = await fetch(`${API_URL}/verify-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                order_id: orderId,
                tx_hash: txHash,
                wallet_address: walletAddress,
                order_type: orderType
            })
        });
        
        const result = await response.json();
        return result;
        
    } catch (error) {
        console.error('Verification error:', error);
        return { success: false, message: 'خطأ في التحقق من الدفع' };
    }
}

async function buyStars() {
    console.log('🛒 Buying stars...');
    
    if (!checkWalletBeforePurchase()) return;
    
    const username = document.getElementById("user-name").innerText || document.getElementById("username-input").value.trim();
    const amount = document.getElementById("stars-amount").value;
    const walletAddress = document.getElementById("walletAddress").value;
    
    if (!username) {
        showNotification('❌ أدخل اسم المستخدم', 'error');
        return;
    }
    
    if (!amount || amount < 50) {
        showNotification('❌ أقل كمية 50 نجمة', 'error');
        return;
    }
    
    if (!tonConnectUI || !tonConnectUI.wallet) {
        showNotification('❌ المحفظة غير متصلة', 'error');
        connectTonWallet();
        return;
    }
    
    const TON_PER_STAR = 0.0099273;
    const tonAmount = (amount * TON_PER_STAR).toFixed(4);
    
    // إنشاء الأوردر
    showNotification('📝 جاري إنشاء الطلب...', 'warning');
    
    const orderResult = await createOrder('stars', {
        user_id: 1,
        recipient: username,
        amount: amount,
        ton_amount: tonAmount,
        wallet_address: walletAddress
    });
    
    if (!orderResult.success) {
        showNotification('❌ ' + orderResult.message, 'error');
        return;
    }
    
    const orderId = orderResult.data.order_id;
    console.log('✅ Order created:', orderId);
    
    // فتح المحفظة للدفع
    showNotification('🔄 جاري فتح المحفظة...', 'success');
    
    try {
        const result = await tonConnectUI.sendTransaction({
            validUntil: Math.floor(Date.now() / 1000) + 600,
            messages: [
                {
                    address: RECEIVER_WALLET,
                    amount: toNano(tonAmount)
                }
            ]
        });
        
        console.log('✅ Transaction sent:', result);
        
        // استخراج TX Hash
        const txHash = result.boc || result.hash || 'unknown';
        
        // 🔒 التحقق من الدفع (مكافحة العملات الوهمية)
        const verification = await verifyPayment(orderId, txHash, walletAddress, 'stars');
        
        if (!verification.success) {
            showNotification('🚨 ' + verification.message, 'error');
            showNotification('⚠️ تم رفض العملة: غير أصلية', 'error');
            return;
        }
        
        showNotification(`✅ تم شراء ${amount} نجمة بنجاح!`, 'success');
        
        saveOrder({
            type: 'stars',
            username: username,
            amount: amount,
            tonAmount: tonAmount,
            date: getFormattedDate(),
            boc: result.boc,
            orderId: orderId,
            verified: true
        });
        
    } catch (error) {
        console.error('❌ Transaction failed:', error);
        
        if (error.message?.includes('cancelled') || error.message?.includes('rejected')) {
            showNotification('❌ تم إلغاء المعاملة', 'error');
        } else if (error.message?.includes('timeout')) {
            showNotification('❌ انتهت المهلة', 'error');
        } else {
            showNotification('❌ فشل المعاملة', 'error');
        }
    }
}

async function buyPremium() {
    console.log('🛒 Buying premium...');
    
    if (!checkWalletBeforePurchase()) return;
    
    const username = document.getElementById("premium-user-name").innerText || document.getElementById("premium-username-input").value.trim();
    const selectedPlan = document.querySelector('.plan.active-plan');
    const walletAddress = document.getElementById("walletAddress").value;
    
    if (!username) {
        showNotification('❌ أدخل اسم المستخدم', 'error');
        return;
    }
    
    if (!selectedPlan) {
        showNotification('❌ اختر المدة', 'error');
        return;
    }
    
    if (!tonConnectUI || !tonConnectUI.wallet) {
        showNotification('❌ المحفظة غير متصلة', 'error');
        connectTonWallet();
        return;
    }
    
    const tonAmount = selectedPlan.getAttribute('data-ton');
    const planName = selectedPlan.querySelector('span').innerText;
    
    // إنشاء الأوردر
    showNotification('📝 جاري إنشاء الطلب...', 'warning');
    
    const orderResult = await createOrder('premium', {
        user_id: 1,
        recipient: username,
        plan: planName,
        ton_amount: tonAmount,
        wallet_address: walletAddress
    });
    
    if (!orderResult.success) {
        showNotification('❌ ' + orderResult.message, 'error');
        return;
    }
    
    const orderId = orderResult.data.order_id;
    
    // فتح المحفظة
    showNotification('🔄 جاري فتح المحفظة...', 'success');
    
    try {
        const result = await tonConnectUI.sendTransaction({
            validUntil: Math.floor(Date.now() / 1000) + 600,
            messages: [
                {
                    address: RECEIVER_WALLET,
                    amount: toNano(tonAmount)
                }
            ]
        });
        
        console.log('✅ Transaction sent:', result);
        
        const txHash = result.boc || result.hash || 'unknown';
        
        // 🔒 التحقق من الدفع
        const verification = await verifyPayment(orderId, txHash, walletAddress, 'premium');
        
        if (!verification.success) {
            showNotification('🚨 ' + verification.message, 'error');
            showNotification('⚠️ تم رفض العملة: غير أصلية', 'error');
            return;
        }
        
        showNotification(`✅ تم شراء ${planName} بنجاح!`, 'success');
        
        saveOrder({
            type: 'premium',
            username: username,
            plan: planName,
            tonAmount: tonAmount,
            date: getFormattedDate(),
            boc: result.boc,
            orderId: orderId,
            verified: true
        });
        
    } catch (error) {
        console.error('❌ Transaction failed:', error);
        
        if (error.message?.includes('cancelled') || error.message?.includes('rejected')) {
            showNotification('❌ تم إلغاء المعاملة', 'error');
        } else {
            showNotification('❌ فشل المعاملة', 'error');
        }
    }
}

function saveOrder(order) {
    try {
        const orders = JSON.parse(localStorage.getItem('orders') || '[]');
        orders.push(order);
        localStorage.setItem('orders', JSON.stringify(orders));
        console.log('✅ Order saved:', order);
    } catch (e) {
        console.error('Save error:', e);
    }
}

/* ============================================================
   Init
============================================================ */

document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ Page loaded with TON Anti-Fake Protection');
    
    fetchTonPrice();
    setInterval(fetchTonPrice, 30000);
    
    setTimeout(initTonConnect, 1500);
});
