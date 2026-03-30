/* ============================================================
   starGo - Secure Frontend (No Fake Purchases)
============================================================ */

const RECEIVER_WALLET = "UQBPpnRDUyTVXzJk4Qxr02z4iPFZfWv8NC2fvOjHe8UtmpHE";
const SERVER_URL = "http://localhost:3000"; // غيره حسب سيرفرك

window.tonPrice = null;
const FIXED_FEE = 0.20;
let tonConnectUI = null;

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
   Purchase - SECURE VERSION (No Fake Purchases)
============================================================ */

async function buyStars() {
    console.log('🛒 Starting secure star purchase...');
    
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
    
    // ⚠️ الخطوة 1: إنشاء الأوردر في السيرفر أولاً (pending)
    let orderId;
    try {
        showNotification('🔄 جاري إنشاء الطلب...', 'warning');
        
        const loginRes = await fetch(`${SERVER_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username.replace('@', '') })
        });
        const loginData = await loginRes.json();
        
        if (!loginData.success) {
            showNotification('❌ فشل في تسجيل الدخول', 'error');
            return;
        }
        
        const orderRes = await fetch(`${SERVER_URL}/api/order/stars`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: loginData.data.user_id,
                recipient: username,
                amount: amount,
                ton_amount: tonAmount,
                wallet_address: walletAddress
            })
        });
        
        const orderData = await orderRes.json();
        
        if (!orderData.success) {
            showNotification('❌ ' + orderData.message, 'error');
            return;
        }
        
        orderId = orderData.data.order_id;
        console.log('✅ Order created:', orderId);
        
    } catch (error) {
        console.error('❌ Order creation failed:', error);
        showNotification('❌ فشل في إنشاء الطلب', 'error');
        return;
    }
    
    // ⚠️ الخطوة 2: فتح المحفظة للدفع
    showNotification('🔄 جاري فتح المحفظة للدفع...', 'warning');
    
    let txResult;
    try {
        txResult = await tonConnectUI.sendTransaction({
            validUntil: Math.floor(Date.now() / 1000) + 600,
            messages: [
                {
                    address: RECEIVER_WALLET,
                    amount: toNano(tonAmount)
                }
            ]
        });
        
        console.log('✅ Transaction sent:', txResult);
        
    } catch (error) {
        console.error('❌ Transaction failed:', error);
        
        // ❌ لو فشل الدفع، نحدث الأوردر إنه فشل
        try {
            await fetch(`${SERVER_URL}/api/order/${orderId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'failed' })
            });
        } catch (e) { console.error('Failed to update order:', e); }
        
        if (error.message?.includes('cancelled') || error.message?.includes('rejected')) {
            showNotification('❌ تم إلغاء المعاملة', 'error');
        } else if (error.message?.includes('timeout')) {
            showNotification('❌ انتهت المهلة', 'error');
        } else {
            showNotification('❌ فشل الدفع - تأكد من وجود رصيد كافي', 'error');
        }
        return;
    }
    
    // ⚠️ الخطوة 3: التحقق من الدفع في السيرفر (أهم خطوة!)
    showNotification('🔄 جاري التحقق من الدفع...', 'warning');
    
    try {
        const verifyRes = await fetch(`${SERVER_URL}/api/verify-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                order_id: orderId,
                tx_hash: txResult.boc || txResult.hash,
                wallet_address: walletAddress,
                order_type: 'stars'
            })
        });
        
        const verifyData = await verifyRes.json();
        
        if (!verifyData.success) {
            // ❌ السيرفر رفض الدفع (عملة وهمية، مبلغ غلط، إلخ)
            showNotification('❌ ' + verifyData.message, 'error');
            console.error('🚨 Payment verification failed:', verifyData);
            return;
        }
        
        // ✅ السيرفر أكد إن الدفع حقيقي
        showNotification(`✅ تم شراء ${amount} نجمة بنجاح!`, 'success');
        console.log('✅ Payment verified by server:', verifyData);
        
    } catch (error) {
        console.error('❌ Verification request failed:', error);
        showNotification('⚠️ تم الدفع لكن فشل التحقق - تواصل مع الدعم', 'warning');
    }
}

async function buyPremium() {
    console.log('🛒 Starting secure premium purchase...');
    
    if (!checkWalletBeforePurchase()) return;
    
    const username = document.getElementById("premium-user-name").innerText || document.getElementById("premium-username-input").value.trim();
    const selectedPlan = document.querySelector('.plan.active-plan');
    const walletAddress = document.getElementById('walletAddress').value;
    
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
    
    // ⚠️ الخطوة 1: إنشاء الأوردر في السيرفر
    let orderId;
    try {
        showNotification('🔄 جاري إنشاء الطلب...', 'warning');
        
        const loginRes = await fetch(`${SERVER_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username.replace('@', '') })
        });
        const loginData = await loginRes.json();
        
        const orderRes = await fetch(`${SERVER_URL}/api/order/premium`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: loginData.data.user_id,
                recipient: username,
                plan: planName,
                ton_amount: tonAmount,
                wallet_address: walletAddress
            })
        });
        
        const orderData = await orderRes.json();
        
        if (!orderData.success) {
            showNotification('❌ ' + orderData.message, 'error');
            return;
        }
        
        orderId = orderData.data.order_id;
        
    } catch (error) {
        showNotification('❌ فشل في إنشاء الطلب', 'error');
        return;
    }
    
    // ⚠️ الخطوة 2: الدفع
    showNotification('🔄 جاري فتح المحفظة للدفع...', 'warning');
    
    let txResult;
    try {
        txResult = await tonConnectUI.sendTransaction({
            validUntil: Math.floor(Date.now() / 1000) + 600,
            messages: [
                {
                    address: RECEIVER_WALLET,
                    amount: toNano(tonAmount)
                }
            ]
        });
        
    } catch (error) {
        // ❌ فشل الدفع
        try {
            await fetch(`${SERVER_URL}/api/order/${orderId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'failed' })
            });
        } catch (e) { }
        
        if (error.message?.includes('cancelled') || error.message?.includes('rejected')) {
            showNotification('❌ تم إلغاء المعاملة', 'error');
        } else {
            showNotification('❌ فشل الدفع - تأكد من وجود رصيد كافي', 'error');
        }
        return;
    }
    
    // ⚠️ الخطوة 3: التحقق من السيرفر
    showNotification('🔄 جاري التحقق من الدفع...', 'warning');
    
    try {
        const verifyRes = await fetch(`${SERVER_URL}/api/verify-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                order_id: orderId,
                tx_hash: txResult.boc || txResult.hash,
                wallet_address: walletAddress,
                order_type: 'premium'
            })
        });
        
        const verifyData = await verifyRes.json();
        
        if (!verifyData.success) {
            showNotification('❌ ' + verifyData.message, 'error');
            return;
        }
        
        showNotification(`✅ تم شراء ${planName} بنجاح!`, 'success');
        
    } catch (error) {
        showNotification('⚠️ تم الدفع لكن فشل التحقق - تواصل مع الدعم', 'warning');
    }
}

// ❌ حذفت saveOrder - مبقتش محتاجها لأن السيرفر هو اللي بيحفظ

/* ============================================================
   Init
============================================================ */

document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ Secure page loaded');
    
    fetchTonPrice();
    setInterval(fetchTonPrice, 30000);
    
    setTimeout(initTonConnect, 1500);
});

