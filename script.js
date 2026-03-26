/* ============================================================
   starGo - Final Version with TON Payment Verification
   ============================================================ */

const RECEIVER_WALLET = "UQBPpnRDUyTVXzJk4Qxr02z4iPFZfWv8NC2fvOjHe8UtmpHE";
const API_BASE_URL = 'http://localhost:3000'; // ⚠️ حط الرابط كامل هنا

window.tonPrice = null;
const FIXED_FEE = 0.20;
let tonConnectUI = null;
let currentOrderId = null;

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
                saveWalletToServer(wallet.account.address);
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

async function saveWalletToServer(walletAddress) {
    const userId = localStorage.getItem('user_id');
    if (!userId) return;
    
    try {
        await fetch(`${API_BASE_URL}/api/wallet`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                wallet_address: walletAddress
            })
        });
    } catch (e) {
        console.warn('Wallet save error:', e);
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
   🔐 TON Payment Verification - مع error handling محسن
   ============================================================ */

async function createOrderOnServer(type, data) {
    try {
        const endpoint = type === 'stars' ? '/api/order/stars' : '/api/order/premium';
        const url = `${API_BASE_URL}${endpoint}`;
        
        console.log('🔍 Sending to:', url);
        console.log('📦 Data:', data);
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        console.log('📥 Response status:', response.status);
        
        const text = await response.text();
        console.log('📄 Raw response:', text);
        
        if (!text) {
            throw new Error('السيرفر رجع response فاضي');
        }
        
        let result;
        try {
            result = JSON.parse(text);
        } catch (e) {
            console.error('❌ JSON parse error:', e);
            throw new Error('السيرفر رجع بيانات مش JSON: ' + text.substring(0, 100));
        }
        
        if (!result.success) {
            throw new Error(result.message || 'خطأ غير معروف من السيرفر');
        }
        
        return result.data.order_id;
        
    } catch (error) {
        console.error('❌ Order creation error:', error);
        throw error;
    }
}

async function verifyPaymentOnServer(orderId, txHash, tonAmount) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/verify-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                order_id: orderId,
                tx_hash: txHash,
                ton_amount: parseFloat(tonAmount)
            })
        });
        
        const text = await response.text();
        
        if (!text) {
            return { success: false, message: 'السيرفر رجع response فاضي' };
        }
        
        let result;
        try {
            result = JSON.parse(text);
        } catch (e) {
            return { success: false, message: 'رد السيرفر غير صالح' };
        }
        
        return result;
    } catch (error) {
        console.error('Payment verification error:', error);
        return { success: false, message: 'خطأ في الاتصال بالسيرفر' };
    }
}

async function getTransactionHashFromBoc(boc) {
    return boc;
}

/* ============================================================
   Purchase - مع التحقق من الدفع
   ============================================================ */

async function buyStars() {
    console.log('🛒 Buying stars...');
    
    if (!checkWalletBeforePurchase()) return;
    
    const username = document.getElementById("user-name").innerText || document.getElementById("username-input").value.trim();
    const amount = document.getElementById("stars-amount").value;
    const userId = localStorage.getItem('user_id') || 'guest_' + Date.now();
    
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
    
    showNotification('🔄 جاري إنشاء الطلب...', 'warning');
    
    try {
        currentOrderId = await createOrderOnServer('stars', {
            user_id: userId,
            recipient: username.replace('@', ''),
            amount: parseInt(amount),
            ton_amount: parseFloat(tonAmount)
        });
        
        console.log('✅ Order created:', currentOrderId);
        showNotification('🔄 جاري فتح المحفظة للدفع...', 'success');
        
    } catch (error) {
        showNotification('❌ فشل إنشاء الطلب: ' + error.message, 'error');
        return;
    }
    
    try {
        const result = await tonConnectUI.sendTransaction({
            validUntil: Math.floor(Date.now() / 1000) + 600,
            messages: [
                {
                    address: RECEIVER_WALLET,
                    amount: toNano(tonAmount),
                    payload: base64Encode(currentOrderId)
                }
            ]
        });
        
        console.log('✅ Transaction sent:', result);
        showNotification('🔄 جاري التحقق من الدفع...', 'warning');
        
        const txHash = await getTransactionHashFromBoc(result.boc);
        const verification = await verifyPaymentOnServer(currentOrderId, txHash, tonAmount);
        
        if (verification.success) {
            showNotification(`✅ تم التحقق! ${amount} نجمة قيد المعالجة`, 'success');
            
            saveOrder({
                type: 'stars',
                username: username,
                amount: amount,
                tonAmount: tonAmount,
                date: getFormattedDate(),
                orderId: currentOrderId,
                txHash: txHash,
                verified: true
            });
            
            document.getElementById("stars-amount").value = '';
            document.getElementById("calc-result").innerHTML = '';
            
        } else {
            showNotification('❌ فشل التحقق: ' + verification.message, 'error');
        }
        
    } catch (error) {
        console.error('❌ Transaction failed:', error);
        
        if (error.message?.includes('cancelled') || error.message?.includes('rejected')) {
            showNotification('❌ تم إلغاء المعاملة', 'error');
        } else if (error.message?.includes('timeout')) {
            showNotification('❌ انتهت المهلة', 'error');
        } else {
            showNotification('❌ فشل المعاملة: ' + error.message, 'error');
        }
    }
}

async function buyPremium() {
    console.log('🛒 Buying premium...');
    
    if (!checkWalletBeforePurchase()) return;
    
    const username = document.getElementById("premium-user-name").innerText || document.getElementById("premium-username-input").value.trim();
    const selectedPlan = document.querySelector('.plan.active-plan');
    const userId = localStorage.getItem('user_id') || 'guest_' + Date.now();
    
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
    
    showNotification('🔄 جاري إنشاء الطلب...', 'warning');
    
    try {
        currentOrderId = await createOrderOnServer('premium', {
            user_id: userId,
            recipient: username.replace('@', ''),
            plan: planName,
            ton_amount: parseFloat(tonAmount)
        });
        
        console.log('✅ Order created:', currentOrderId);
        showNotification('🔄 جاري فتح المحفظة للدفع...', 'success');
        
    } catch (error) {
        showNotification('❌ فشل إنشاء الطلب: ' + error.message, 'error');
        return;
    }
    
    try {
        const result = await tonConnectUI.sendTransaction({
            validUntil: Math.floor(Date.now() / 1000) + 600,
            messages: [
                {
                    address: RECEIVER_WALLET,
                    amount: toNano(tonAmount),
                    payload: base64Encode(currentOrderId)
                }
            ]
        });
        
        console.log('✅ Transaction sent:', result);
        showNotification('🔄 جاري التحقق من الدفع...', 'warning');
        
        const txHash = await getTransactionHashFromBoc(result.boc);
        const verification = await verifyPaymentOnServer(currentOrderId, txHash, tonAmount);
        
        if (verification.success) {
            showNotification(`✅ تم التحقق! ${planName} قيد المعالجة`, 'success');
            
            saveOrder({
                type: 'premium',
                username: username,
                plan: planName,
                tonAmount: tonAmount,
                date: getFormattedDate(),
                orderId: currentOrderId,
                txHash: txHash,
                verified: true
            });
            
        } else {
            showNotification('❌ فشل التحقق: ' + verification.message, 'error');
        }
        
    } catch (error) {
        console.error('❌ Transaction failed:', error);
        
        if (error.message?.includes('cancelled') || error.message?.includes('rejected')) {
            showNotification('❌ تم إلغاء المعاملة', 'error');
        } else {
            showNotification('❌ فشل المعاملة: ' + error.message, 'error');
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
    console.log('✅ Page loaded');
    
    fetchTonPrice();
    setInterval(fetchTonPrice, 30000);
    
    setTimeout(initTonConnect, 1500);
});

/* ============================================================
   🔐 FORT KNOX ADMIN ACCESS - Maximum Security
   ============================================================ */

const ADMIN_PASSWORD_HASH = 'لااؤبملا';

const SECURITY_CONFIG = {
    maxAttempts: 3,
    lockoutTime: 5 * 60 * 1000,
    sessionTimeout: 30 * 60 * 1000
};

let attempts = parseInt(localStorage.getItem('adminAttempts') || '0');
let lockoutEnd = parseInt(localStorage.getItem('lockoutEnd') || '0');
let keyBuffer = [];

async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function isLocked() {
    if (Date.now() < lockoutEnd) {
        const mins = Math.ceil((lockoutEnd - Date.now()) / 60000);
        alert(`⛔ محظور! جرب بعد ${mins} دقيقة`);
        return true;
    }
    if (lockoutEnd > 0 && Date.now() > lockoutEnd) {
        attempts = 0;
        localStorage.setItem('adminAttempts', '0');
        localStorage.setItem('lockoutEnd', '0');
    }
    return false;
}

function recordFailedAttempt() {
    attempts++;
    localStorage.setItem('adminAttempts', attempts.toString());
    if (attempts >= SECURITY_CONFIG.maxAttempts) {
        lockoutEnd = Date.now() + SECURITY_CONFIG.lockoutTime;
        localStorage.setItem('lockoutEnd', lockoutEnd.toString());
        alert('🚫 3 محاولات فاشلة! محظور 5 دقايق');
    }
}

document.addEventListener('keydown', async (e) => {
    if (e.altKey && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        
        const newPass = prompt('🔧 Admin Setup Mode\n\nاكتب الباسورد الجديد اللي عايزه:');
        if (!newPass || newPass.length < 4) {
            alert('❌ لازم 4 أحرف على الأقل!');
            return;
        }
        
        const hash = await hashPassword(newPass);
        
        alert(`✅ الباسورد الجديد: "${newPass}"\n\n🔐 الـ Hash اللي تستخدمه:\n${hash}\n\nانسخ الـ Hash ده واستبدله في الكود في سطر ADMIN_PASSWORD_HASH`);
        console.log('%c🔐 NEW PASSWORD HASH:', 'color: #00ff00; font-size: 16px; font-weight: bold;');
        console.log('%c' + hash, 'color: #ffff00; font-size: 14px;');
        console.log('%cاستبدل ده في الكود في ADMIN_PASSWORD_HASH', 'color: #ff0000; font-size: 12px;');
        
        return;
    }
});

function securePrompt() {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.innerHTML = `
            <div style="position:fixed; top:0; left:0; width:100%; height:100%; 
                        background:rgba(0,0,0,0.95); z-index:99999; display:flex; 
                        align-items:center; justify-content:center;">
                <div style="background:#1a1a1a; padding:30px; border-radius:10px; 
                            border:2px solid #ff3333; text-align:center; min-width:300px;">
                    <h3 style="color:#ff3333; margin:0 0 20px;">🔐 ADMIN ACCESS</h3>
                    <input type="password" id="adminPassInput" placeholder="Enter password..." 
                           style="padding:12px; width:100%; margin-bottom:15px; 
                                  background:#000; color:#0f0; border:1px solid #333; font-size:16px;">
                    <div>
                        <button id="adminSubmit" style="padding:10px 25px; 
                                background:#ff3333; color:white; border:none; 
                                cursor:pointer; margin-right:10px; font-size:14px;">دخول</button>
                        <button id="adminCancel" style="padding:10px 25px; 
                                background:#333; color:white; border:none; 
                                cursor:pointer; font-size:14px;">إلغاء</button>
                    </div>
                    <p style="color:#666; font-size:11px; margin-top:15px;">
                        محاولات فاشلة: ${attempts}/${SECURITY_CONFIG.maxAttempts}
                    </p>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        const input = modal.querySelector('#adminPassInput');
        input.focus();
        
        modal.querySelector('#adminSubmit').onclick = async () => {
            const val = input.value;
            modal.remove();
            resolve(val);
        };
        
        modal.querySelector('#adminCancel').onclick = () => {
            modal.remove();
            resolve(null);
        };
        
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                modal.querySelector('#adminSubmit').click();
            }
        });
    });
}

document.addEventListener('keydown', async (e) => {
    if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        e.stopPropagation();
        
        if (isLocked()) return;
        
        const password = await securePrompt();
        if (!password) return;
        
        const inputHash = await hashPassword(password);
        
        if (inputHash === ADMIN_PASSWORD_HASH) {
            attempts = 0;
            localStorage.setItem('adminAttempts', '0');
            sessionStorage.setItem('adminVerified', Date.now().toString());
            window.location.replace('admin.html');
        } else {
            recordFailedAttempt();
            const remaining = SECURITY_CONFIG.maxAttempts - attempts;
            alert(`❌ غلط! ${remaining} محاولات باقية`);
        }
        return false;
    }
    
    keyBuffer.push(e.key);
    if (keyBuffer.length > 10) keyBuffer.shift();
    
    const konami = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
    if (keyBuffer.join(',') === konami.join(',')) {
        e.preventDefault();
        keyBuffer = [];
        
        if (isLocked()) return;
        
        const password = await securePrompt();
        if (!password) return;
        
        const inputHash = await hashPassword(password);
        
        if (inputHash === ADMIN_PASSWORD_HASH) {
            attempts = 0;
            localStorage.setItem('adminAttempts', '0');
            sessionStorage.setItem('adminVerified', Date.now().toString());
            window.location.replace('admin.html');
        } else {
            recordFailedAttempt();
            alert(`❌ غلط! ${SECURITY_CONFIG.maxAttempts - attempts} محاولات باقية`);
        }
    }
});

if (window.location.pathname.includes('admin.html')) {
    const verified = sessionStorage.getItem('adminVerified');
    if (!verified || (Date.now() - parseInt(verified)) > SECURITY_CONFIG.sessionTimeout) {
        alert('⛔ Session expired!');
        window.location.replace('index.html');
    }
}
