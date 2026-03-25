/* ============================================================
   starGo - Full JavaScript File (Fixed TON Connect)
   Version: 6.0 (Using TonConnect UI)
============================================================ */

const RECEIVER_WALLET = "UQBPpnRDUyTVXzJk4Qxr02z4iPFZfWv8NC2fvOjHe8UtmpHE";

window.tonPrice = null;
const FIXED_FEE = 0.20;
let tonConnectUI = null;
let isConnecting = false;

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
    if (oldNotification) {
        oldNotification.remove();
    }
    
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
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 3000);
}

/* ============================================================
   TON Connect UI Initialization
============================================================ */

function initTonConnect() {
    console.log('🔄 Initializing TON Connect UI...');
    
    // التحقق من وجود المكتبة
    if (typeof window.TON_CONNECT_UI === 'undefined') {
        console.warn('❌ TON_CONNECT_UI not found, retrying in 1s...');
        showNotification('🔄 جاري تحميل مكتبة TON Connect...', 'warning');
        setTimeout(initTonConnect, 1000);
        return;
    }
    
    try {
        // ✅ استخدام TON_CONNECT_UI
        const manifestUrl = window.location.origin + '/tonconnect-manifest.json';
        console.log('🔗 Manifest URL:', manifestUrl);
        
        tonConnectUI = new window.TON_CONNECT_UI.TonConnectUI({
            manifestUrl: manifestUrl,
            buttonRootId: null // مش هنستخدم الزر الافتراضي
        });
        
        console.log('✅ TonConnectUI initialized:', tonConnectUI);
        
        // الاستماع لتغييرات الحالة
        tonConnectUI.onStatusChange((wallet) => {
            handleWalletStatusChange(wallet);
        });
        
        // التحقق من اتصال سابق
        setTimeout(() => {
            checkExistingConnection();
        }, 500);
        
        showNotification('✅ جاهز لربط المحفظة', 'success');
        
    } catch (e) {
        console.error('❌ Error initializing TonConnectUI:', e);
        showNotification('❌ خطأ في تهيئة TON Connect: ' + e.message, 'error');
    }
}

function handleWalletStatusChange(wallet) {
    if (wallet) {
        console.log('✅ Wallet connected:', wallet);
        updateWalletUI(wallet);
        showNotification(`✅ تم ربط محفظة ${wallet.device?.appName || 'TON'} بنجاح`, 'success');
        
        // حفظ في localStorage
        const walletInfo = {
            address: wallet.account.address,
            provider: wallet.device?.appName || 'tonconnect',
            connectedAt: getFormattedDate()
        };
        localStorage.setItem('connected_wallet', JSON.stringify(walletInfo));
        
    } else {
        console.log('❌ Wallet disconnected');
        document.getElementById('walletInfo').style.display = 'none';
        document.getElementById('connectTonWalletBtn').innerHTML = '<i class="fas fa-wallet"></i> ربط محفظة TON';
        document.getElementById('walletAddress').value = '';
        document.getElementById('walletProvider').value = '';
        
        localStorage.removeItem('connected_wallet');
    }
}

async function checkExistingConnection() {
    try {
        if (!tonConnectUI) return;
        
        const wallet = tonConnectUI.wallet;
        if (wallet) {
            console.log('✅ Found existing wallet:', wallet);
            updateWalletUI(wallet);
        } else {
            // محاولة الاستعادة من localStorage
            const savedWallet = localStorage.getItem('connected_wallet');
            if (savedWallet) {
                console.log('📦 Found saved wallet in localStorage');
            }
        }
    } catch (error) {
        console.error('Error checking connection:', error);
    }
}

function updateWalletUI(wallet) {
    if (!wallet || !wallet.account) return;
    
    document.getElementById('walletAddress').value = wallet.account.address;
    document.getElementById('walletProvider').value = wallet.device?.appName || 'tonconnect';
    
    const shortAddress = wallet.account.address.substring(0, 8) + '...' + 
                        wallet.account.address.substring(wallet.account.address.length - 8);
    document.getElementById('connectedAddress').textContent = shortAddress;
    
    document.getElementById('walletInfo').style.display = 'block';
    document.getElementById('connectTonWalletBtn').innerHTML = '<i class="fas fa-check-circle"></i> المحفظة مربوطة';
    
    getWalletBalance(wallet.account.address);
}

async function getWalletBalance(address) {
    try {
        const controllers = [
            `https://toncenter.com/api/v2/getAddressBalance?address=${address}`,
            `https://testnet.toncenter.com/api/v2/getAddressBalance?address=${address}`
        ];
        
        for (const url of controllers) {
            try {
                const response = await fetch(url);
                const data = await response.json();
                if (data.ok) {
                    const balance = data.result / 1e9;
                    document.getElementById('balanceAmount').textContent = balance.toFixed(2);
                    document.getElementById('walletBalance').style.display = 'flex';
                    break;
                }
            } catch (e) {
                console.warn(`Failed to fetch from ${url}:`, e);
            }
        }
    } catch (error) {
        console.error('Error getting balance:', error);
    }
}

/* ============================================================
   Wallet Connection
============================================================ */

async function connectTonWallet() {
    console.log('🔘 Connect wallet button clicked');
    
    if (!tonConnectUI) {
        showNotification('🔄 جاري تهيئة TON Connect...', 'warning');
        initTonConnect();
        setTimeout(connectTonWallet, 1500);
        return;
    }
    
    if (isConnecting) {
        showNotification('🔄 جاري الاتصال بالفعل...', 'warning');
        return;
    }
    
    try {
        isConnecting = true;
        closeSidebar();
        
        showNotification('🔄 جاري فتح نافذة المحفظة...', 'success');
        console.log('📤 Opening connect modal...');
        
        // ✅ فتح نافذة الاتصال
        await tonConnectUI.openModal();
        
        console.log('✅ Modal opened successfully');
        
    } catch (error) {
        console.error('❌ Error opening wallet:', error);
        
        let errorMessage = 'فشل فتح المحفظة';
        if (error.message && error.message.includes('closed')) {
            errorMessage = 'تم إغلاق نافذة المحفظة';
        } else if (error.message && error.message.includes('manifest')) {
            errorMessage = 'مشكلة في ملف manifest.json';
        }
        
        showNotification(`❌ ${errorMessage}`, 'error');
    } finally {
        isConnecting = false;
    }
}

async function disconnectWallet() {
    if (!tonConnectUI) {
        showNotification('❌ لا يوجد اتصال', 'error');
        return;
    }
    
    try {
        await tonConnectUI.disconnect();
        showNotification('✅ تم قطع الاتصال', 'success');
    } catch (error) {
        console.error('Error disconnecting:', error);
        showNotification('❌ فشل قطع الاتصال', 'error');
    }
}

function checkWalletBeforePurchase() {
    const walletInfo = document.getElementById('walletInfo');
    const walletAddress = document.getElementById('walletAddress').value;
    
    if (!walletInfo || walletInfo.style.display !== 'block' || !walletAddress) {
        showNotification('⚠️ يجب ربط المحفظة أولاً قبل الشراء', 'warning');
        
        const sidebar = document.getElementById("sidebar");
        const overlay = document.getElementById("overlay");
        sidebar.classList.add("open");
        overlay.style.display = "block";
        
        return false;
    }
    return true;
}

/* ============================================================
   UI Functions
============================================================ */

function toggleSidebar() {
    const sb = document.getElementById("sidebar");
    const ov = document.getElementById("overlay");
    if (sb.classList.contains("open")) {
        sb.classList.remove("open");
        ov.style.display = "none";
        document.body.style.overflow = '';
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
}

/* ============================================================
   Prices and Packages
============================================================ */

function setupPackageClick() {
    document.querySelectorAll(".package").forEach(pkg => {
        pkg.addEventListener("click", () => {
            document.querySelectorAll(".package").forEach(x => x.classList.remove("active-package"));
            pkg.classList.add("active-package");
            const radio = pkg.querySelector("input[type='radio']");
            if (radio) radio.checked = true;
            const amount = pkg.getAttribute("data-amount");
            const starsInput = document.getElementById("stars-amount");
            if (starsInput) starsInput.value = amount;
            calculateCustomAmount();
            const calc = document.getElementById("calc-result");
            if (calc) calc.scrollIntoView({ behavior: "smooth", block: "center" });
        });
    });
}

function setupPremiumSelect() {
    document.querySelectorAll(".plan").forEach(plan => {
        plan.addEventListener("click", () => {
            document.querySelectorAll(".plan").forEach(p => p.classList.remove("active-plan"));
            plan.classList.add("active-plan");
            const input = plan.querySelector("input");
            if (input) input.checked = true;
        });
    });
}

async function fetchTonPrice() {
    try {
        const res = await fetch("https://api.coinbase.com/v2/exchange-rates?currency=TON");
        const j = await res.json();
        const rate = parseFloat(j.data.rates.USD);
        let usdPerTon = rate;
        if (rate < 0.001) usdPerTon = 1 / rate;
        window.tonPrice = usdPerTon;
        updatePackages();
        updatePremiumPrices();
        calculateCustomAmount();
    } catch (e) {
        console.error("TON price error", e);
        window.tonPrice = 5.5;
        updatePackages();
        updatePremiumPrices();
        calculateCustomAmount();
    }
}

function updatePackages() {
    if (!window.tonPrice) return;
    document.querySelectorAll(".package").forEach(pkg => {
        const ton = parseFloat(pkg.getAttribute("data-ton"));
        const usd = ton * window.tonPrice;
        const final = usd + FIXED_FEE;
        const el = pkg.querySelector(".pack-usd");
        if (el) el.innerText = "~ $" + final.toFixed(2);
    });
}

function updatePremiumPrices() {
    if (!window.tonPrice) return;
    document.querySelectorAll(".plan").forEach(plan => {
        const ton = parseFloat(plan.getAttribute("data-ton"));
        const usd = ton * window.tonPrice;
        const final = usd + FIXED_FEE;
        const usdEl = plan.querySelector(".usd-value");
        const tonEl = plan.querySelector(".ton-value");
        if (usdEl) usdEl.innerText = "~ $" + final.toFixed(2);
        if (tonEl) tonEl.innerText = "🔷 " + ton;
    });
}

function calculateCustomAmount() {
    const input = document.getElementById("stars-amount");
    const out = document.getElementById("calc-result");
    if (!input || !out) return;
    const amount = Number(input.value);
    if (!amount || amount < 50) {
        out.innerHTML = "";
        return;
    }
    if (!window.tonPrice) {
        out.innerHTML = "";
        return;
    }
    const TON_PER_STAR = 0.0099273;
    const tonNeeded = amount * TON_PER_STAR;
    const usd = tonNeeded * window.tonPrice;
    const final = usd + FIXED_FEE;
    out.innerHTML = ` <b style="color:#4dd0ff">$${final.toFixed(2)}</b> for <b>${amount} ⭐</b>`;
}

/* ============================================================
   Purchase Handlers - Fixed
============================================================ */

async function handleStarsPurchase() {
    console.log('🛒 Stars purchase clicked');
    
    if (!checkWalletBeforePurchase()) {
        return;
    }
    
    const username = document.getElementById("user-name").innerText || document.getElementById("username-input").value.trim();
    const amount = document.getElementById("stars-amount").value;
    
    if (!username) {
        showNotification('❌ من فضلك أدخل اسم المستخدم', 'error');
        return;
    }
    
    if (!amount || amount < 50) {
        showNotification('❌ أقل كمية 50 نجمة', 'error');
        return;
    }
    
    const TON_PER_STAR = 0.0099273;
    const tonAmount = (amount * TON_PER_STAR).toFixed(4);
    const orderId = "ORD-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7).toUpperCase();
    
    // ✅ التحقق من tonConnectUI
    if (!tonConnectUI) {
        showNotification('❌ TON Connect غير مهيئ. جاري إعادة التهيئة...', 'warning');
        initTonConnect();
        return;
    }
    
    // ✅ التحقق من الاتصال
    if (!tonConnectUI.wallet) {
        showNotification('❌ المحفظة غير متصلة. جاري فتح نافذة الاتصال...', 'warning');
        try {
            await tonConnectUI.openModal();
        } catch (e) {
            showNotification('❌ فشل فتح نافذة المحفظة', 'error');
        }
        return;
    }
    
    showNotification(`🔄 جاري إرسال ${amount} نجمة...`, 'success');
    
    try {
        const payload = base64Encode(`STARS_PURCHASE:${username}:${amount}:${orderId}:${Date.now()}`);
        
        console.log('📤 Sending transaction:', {
            validUntil: Math.floor(Date.now() / 1000) + 10 * 60,
            messages: [{
                address: RECEIVER_WALLET,
                amount: toNano(tonAmount),
                payload: payload
            }]
        });
        
        // ✅ إرسال المعاملة
        const result = await tonConnectUI.sendTransaction({
            validUntil: Math.floor(Date.now() / 1000) + 10 * 60,
            messages: [{
                address: RECEIVER_WALLET,
                amount: toNano(tonAmount),
                payload: payload
            }]
        });
        
        console.log('✅ Transaction result:', result);
        showNotification(`✅ تم إرسال ${amount} نجمة بنجاح!`, 'success');
        
        saveOrder({
            type: 'stars',
            username: username,
            amount: amount,
            tonAmount: tonAmount,
            orderId: orderId,
            status: 'completed',
            date: getFormattedDate(),
            transaction: result
        });
        
    } catch (error) {
        console.error('❌ Transaction error:', error);
        
        if (error.message && (error.message.includes('cancelled') || error.message.includes('rejected'))) {
            showNotification('❌ تم إلغاء المعاملة من قبل المستخدم', 'error');
        } else if (error.message && error.message.includes('timeout')) {
            showNotification('❌ انتهت مهلة المعاملة', 'error');
        } else {
            showNotification('❌ فشل إتمام المعاملة', 'error');
        }
    }
}

async function handlePremiumPurchase() {
    console.log('🛒 Premium purchase clicked');
    
    if (!checkWalletBeforePurchase()) {
        return;
    }
    
    const username = document.getElementById("premium-user-name").innerText || document.getElementById("premium-username-input").value.trim();
    const selectedPlan = document.querySelector('.plan.active-plan');
    
    if (!username) {
        showNotification('❌ من فضلك أدخل اسم المستخدم', 'error');
        return;
    }
    
    if (!selectedPlan) {
        showNotification('❌ من فضلك اختر المدة', 'error');
        return;
    }
    
    const tonAmount = selectedPlan.getAttribute('data-ton');
    const planName = selectedPlan.querySelector('span').innerText;
    const orderId = "PRM-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7).toUpperCase();
    
    if (!tonConnectUI) {
        showNotification('❌ TON Connect غير مهيئ. جاري إعادة التهيئة...', 'warning');
        initTonConnect();
        return;
    }
    
    if (!tonConnectUI.wallet) {
        showNotification('❌ المحفظة غير متصلة. جاري فتح نافذة الاتصال...', 'warning');
        try {
            await tonConnectUI.openModal();
        } catch (e) {
            showNotification('❌ فشل فتح نافذة المحفظة', 'error');
        }
        return;
    }
    
    showNotification(`🔄 جاري إرسال طلب ${planName}...`, 'success');
    
    try {
        const payload = base64Encode(`PREMIUM_PURCHASE:${username}:${planName}:${orderId}:${Date.now()}`);
        
        const result = await tonConnectUI.sendTransaction({
            validUntil: Math.floor(Date.now() / 1000) + 10 * 60,
            messages: [{
                address: RECEIVER_WALLET,
                amount: toNano(tonAmount),
                payload: payload
            }]
        });
        
        console.log('✅ Transaction result:', result);
        showNotification(`✅ تم شراء ${planName} بنجاح!`, 'success');
        
        saveOrder({
            type: 'premium',
            username: username,
            plan: planName,
            tonAmount: tonAmount,
            orderId: orderId,
            status: 'completed',
            date: getFormattedDate(),
            transaction: result
        });
        
    } catch (error) {
        console.error('❌ Transaction error:', error);
        
        if (error.message && (error.message.includes('cancelled') || error.message.includes('rejected'))) {
            showNotification('❌ تم إلغاء المعاملة من قبل المستخدم', 'error');
        } else if (error.message && error.message.includes('timeout')) {
            showNotification('❌ انتهت مهلة المعاملة', 'error');
        } else {
            showNotification('❌ فشل إتمام المعاملة', 'error');
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
        console.error('Error saving order:', e);
    }
}

/* ============================================================
   Mobile Enhancements
============================================================ */

function detectDeviceType() {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isTablet = /iPad|Android(?!.*Mobile)/i.test(navigator.userAgent);
    
    if (isMobile) {
        document.body.classList.add('is-mobile');
    } else if (isTablet) {
        document.body.classList.add('is-tablet');
    } else {
        document.body.classList.add('is-desktop');
    }
    
    if ('ontouchstart' in window) {
        document.body.classList.add('touch-device');
    }
}

function setVHVariable() {
    let vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
}

function setupMobileGestures() {
    let touchStartX = 0;
    let touchEndX = 0;
    
    document.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    }, false);
    
    document.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    }, false);
    
    function handleSwipe() {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar.classList.contains('open')) return;
        
        if (touchEndX - touchStartX > 50) {
            closeSidebar();
        }
    }
}

function enhanceMobileForms() {
    const inputs = document.querySelectorAll('input[type="text"], input[type="number"], input[type="tel"]');
    inputs.forEach(input => {
        input.addEventListener('focus', () => {
            document.body.classList.add('input-focused');
        });
        
        input.addEventListener('blur', () => {
            document.body.classList.remove('input-focused');
        });
    });
}

function enhanceMobileDropdowns() {
    const modal = document.getElementById('wallet-modal');
    if (modal) {
        modal.addEventListener('touchmove', (e) => {
            e.stopPropagation();
        }, { passive: false });
    }
}

function addSidebarBackButton() {
    const sidebar = document.getElementById('sidebar');
    
    const oldBtn = document.querySelector('.sidebar-close-btn');
    if (oldBtn) oldBtn.remove();
    
    if (window.innerWidth <= 768) {
        const closeBtn = document.createElement('button');
        closeBtn.className = 'sidebar-close-btn';
        closeBtn.innerHTML = '<i class="fas fa-arrow-right"></i>';
        closeBtn.onclick = closeSidebar;
        closeBtn.setAttribute('aria-label', 'إغلاق القائمة');
        
        sidebar.insertBefore(closeBtn, sidebar.firstChild);
    }
}

function enhanceMobileClicks() {
    document.querySelectorAll('button, .package, .plan, .wallet-item').forEach(el => {
        el.addEventListener('touchstart', () => {
            el.classList.add('touch-active');
        }, { passive: true });
        
        el.addEventListener('touchend', () => {
            setTimeout(() => {
                el.classList.remove('touch-active');
            }, 150);
        }, { passive: true });
        
        el.addEventListener('touchcancel', () => {
            el.classList.remove('touch-active');
        }, { passive: true });
    });
}

function enhanceScrolling() {
    const scrollableElements = document.querySelectorAll('#sidebar, .wallet-modal-body, .packages-container');
    
    scrollableElements.forEach(el => {
        el.addEventListener('touchmove', (e) => {
            e.stopPropagation();
        }, { passive: true });
    });
}

function checkOnlineStatus() {
    window.addEventListener('online', () => {
        showNotification('✅ تم استعادة الاتصال بالإنترنت', 'success');
    });
    
    window.addEventListener('offline', () => {
        showNotification('❌ لا يوجد اتصال بالإنترنت', 'error');
    });
}

function enableOfflineSupport() {
    window.saveOrderOffline = function(order) {
        try {
            const orders = JSON.parse(localStorage.getItem('offline_orders') || '[]');
            orders.push({
                ...order,
                offline: true,
                savedAt: getFormattedDate()
            });
            localStorage.setItem('offline_orders', JSON.stringify(orders));
            showNotification('✅ تم حفظ الطلب محلياً', 'success');
        } catch (e) {
            console.error('Error saving offline order:', e);
        }
    };
}

function initMobileEnhancements() {
    detectDeviceType();
    setVHVariable();
    setupMobileGestures();
    enhanceMobileForms();
    enhanceMobileDropdowns();
    addSidebarBackButton();
    enhanceMobileClicks();
    enhanceScrolling();
    checkOnlineStatus();
    enableOfflineSupport();
    
    window.addEventListener('resize', () => {
        setVHVariable();
        addSidebarBackButton();
    });
    
    window.addEventListener('orientationchange', () => {
        setTimeout(setVHVariable, 100);
        setTimeout(addSidebarBackButton, 100);
    });
}

/* ============================================================
   Event Listeners
============================================================ */

document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ DOM loaded, initializing...');
    
    fetchTonPrice();
    setInterval(fetchTonPrice, 30000);
    setupPackageClick();
    setupPremiumSelect();
    
    // ✅ تأخير تهيئة TON Connect عشان المكتبة تحمل
    setTimeout(() => {
        initTonConnect();
    }, 2000);
    
    initMobileEnhancements();
    
    document.querySelectorAll(".tab-btn").forEach((tab, i) => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".tab-btn").forEach(t => t.classList.remove("active"));
            document.querySelectorAll(".content-box").forEach(c => c.style.display = "none");
            tab.classList.add("active");
            const boxes = document.querySelectorAll(".content-box");
            if (boxes[i]) boxes[i].style.display = "block";
        });
    });
    
    const usernameSubmit = document.getElementById("username-submit");
    if (usernameSubmit) {
        usernameSubmit.addEventListener("click", async () => {
            let user = document.getElementById("username-input").value.trim();
            if (!user) return showNotification("ادخل يوزر التليجرام", 'error');
            if (!user.startsWith("@")) user = "@" + user;
            
            const userNameEl = document.getElementById("user-name");
            if (userNameEl) userNameEl.innerText = user;
            
            const card = document.getElementById("user-card");
            const inputContainer = document.getElementById("user-input-container");
            if (card) card.style.display = "flex";
            if (inputContainer) inputContainer.style.display = "none";
        });
    }
    
    const removeUserBtn = document.getElementById("remove-user");
    if (removeUserBtn) {
        removeUserBtn.addEventListener("click", () => {
            const card = document.getElementById("user-card");
            const inputContainer = document.getElementById("user-input-container");
            if (card) card.style.display = "none";
            if (inputContainer) inputContainer.style.display = "flex";
            const inp = document.getElementById("username-input");
            if (inp) inp.value = "";
        });
    }
    
    const starsAmountInput = document.getElementById("stars-amount");
    if (starsAmountInput) starsAmountInput.addEventListener("input", calculateCustomAmount);
    
    const starsContinueBtn = document.getElementById('stars-continue-btn');
    if (starsContinueBtn) {
        starsContinueBtn.addEventListener("click", handleStarsPurchase);
    }
    
    const premiumContinueBtn = document.getElementById('premium-continue-btn');
    if (premiumContinueBtn) {
        premiumContinueBtn.addEventListener("click", handlePremiumPurchase);
    }
    
    const premiumSubmit = document.getElementById("premium-username-submit");
    if (premiumSubmit) {
        premiumSubmit.addEventListener("click", async () => {
            let user = document.getElementById("premium-username-input").value.trim();
            if (!user) return showNotification("ادخل يوزر التليجرام", 'error');
            if (!user.startsWith("@")) user = "@" + user;
            
            const nameEl = document.getElementById("premium-user-name");
            if (nameEl) nameEl.innerText = user;
            
            const card = document.getElementById("premium-user-card");
            const inputContainer = document.getElementById("premium-user-input-container");
            if (card) card.style.display = "flex";
            if (inputContainer) inputContainer.style.display = "none";
        });
    }
    
    const premiumRemove = document.getElementById("premium-remove-user");
    if (premiumRemove) {
        premiumRemove.addEventListener("click", () => {
            const card = document.getElementById("premium-user-card");
            const inputContainer = document.getElementById("premium-user-input-container");
            if (card) card.style.display = "none";
            if (inputContainer) inputContainer.style.display = "flex";
            const inp = document.getElementById("premium-username-input");
            if (inp) inp.value = "";
        });
    }
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeSidebar();
        }
    });
});

/* ============================================================
   Export functions for global use
============================================================ */

window.connectTonWallet = connectTonWallet;
window.disconnectWallet = disconnectWallet;
window.toggleSidebar = toggleSidebar;
window.closeSidebar = closeSidebar;
