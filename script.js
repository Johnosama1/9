/* ============================================================
   starGo - Full JavaScript File (No Login)
   Version: 4.0 (No Login Required)
============================================================ */

/* ============================================================
   Config & Wallet Settings
============================================================ */

const RECEIVER_WALLET = "UQBPpnRDUyTVXzJk4Qxr02z4iPFZfWv8NC2fvOjHe8UtmpHE";

const SUPPORTED_WALLETS = [
    {
        name: "Tonkeeper",
        appName: "tonkeeper",
        imageUrl: "https://tonkeeper.com/assets/tonkeeper-icon.png",
        aboutUrl: "https://tonkeeper.com",
        bridgeUrl: "https://bridge.tonapi.io/bridge",
        platforms: ["ios", "android", "chrome"],
        universalUrl: "https://app.tonkeeper.com/ton-connect"
    },
    {
        name: "Tonhub",
        appName: "tonhub",
        imageUrl: "https://tonhub.com/tonhub-icon.png",
        aboutUrl: "https://tonhub.com",
        bridgeUrl: "https://connect.tonhubapi.com/tonconnect",
        platforms: ["ios", "android"],
        universalUrl: "https://tonhub.com/ton-connect"
    },
    {
        name: "OpenMask",
        appName: "openmask",
        imageUrl: "https://raw.githubusercontent.com/OpenMask/awesome-openmask/main/logo.svg",
        aboutUrl: "https://www.openmask.app/",
        bridgeUrl: "https://bridge.openmask.app/bridge",
        platforms: ["chrome"],
        universalUrl: "https://www.openmask.app/",
        injected: true
    },
    {
        name: "TonWallet",
        appName: "tonwallet",
        imageUrl: "https://wallet.ton.org/assets/logo.png",
        aboutUrl: "https://wallet.ton.org",
        bridgeUrl: "https://bridge.ton.org/bridge",
        platforms: ["ios", "android", "chrome", "firefox"],
        universalUrl: "https://wallet.ton.org/ton-connect"
    }
];

window.tonPrice = null;
const FIXED_FEE = 0.20;
let selectedWallet = null;
let tonConnect = null;
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

/* ============================================================
   Notification Function
============================================================ */

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
   TON Connect Initialization
============================================================ */

function createManifest() {
    const manifest = {
        url: window.location.origin,
        name: "starGo",
        iconUrl: window.location.origin + "/jimage.jpg",
        termsOfUseUrl: window.location.origin + "/terms.html",
        privacyPolicyUrl: window.location.origin + "/privacy.html"
    };
    
    sessionStorage.setItem('tonconnect-manifest', JSON.stringify(manifest));
    
    return manifest;
}

function initTonConnect() {
    try {
        if (typeof window.TonConnect === 'undefined') {
            console.warn('TonConnect SDK not loaded, attempting to load...');
            showNotification('🔄 جاري تحميل مكتبة TON Connect...', 'warning');
            
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/@tonconnect/sdk@latest/dist/tonconnect-sdk.min.js';
            script.onload = function() {
                console.log('✅ TonConnect SDK loaded successfully');
                showNotification('✅ تم تحميل مكتبة TON Connect', 'success');
                initializeTonConnectWithManifest();
            };
            script.onerror = function() {
                console.error('❌ Failed to load TonConnect SDK');
                showNotification('❌ فشل تحميل مكتبة TON Connect', 'error');
            };
            document.head.appendChild(script);
        } else {
            console.log('✅ TonConnect SDK already loaded');
            initializeTonConnectWithManifest();
        }
    } catch (e) {
        console.error('❌ Error initializing TonConnect:', e);
        showNotification('❌ خطأ في تهيئة TON Connect', 'error');
    }
}

function initializeTonConnectWithManifest() {
    try {
        createManifest();
        
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        
        const manifestUrl = isLocalhost 
            ? window.location.origin + '/tonconnect-manifest.json'
            : 'https://' + window.location.hostname + '/tonconnect-manifest.json';
        
        tonConnect = new window.TonConnect.TonConnect({
            manifestUrl: manifestUrl,
            wallets: SUPPORTED_WALLETS
        });
        
        console.log('✅ TonConnect initialized successfully', tonConnect);
        
        setTimeout(() => {
            checkExistingConnection();
        }, 1000);
        
        setupWalletStatusListener();
        
    } catch (e) {
        console.error('❌ Error creating TonConnect instance:', e);
        showNotification('❌ فشل إنشاء اتصال TON', 'error');
    }
}

function setupWalletStatusListener() {
    if (!tonConnect) return;
    
    try {
        if (typeof tonConnect.onStatusChange === 'function') {
            tonConnect.onStatusChange((wallet) => {
                handleWalletStatusChange(wallet);
            });
        } else if (typeof tonConnect.subscribe === 'function') {
            tonConnect.subscribe((wallet) => {
                handleWalletStatusChange(wallet);
            });
        } else {
            console.warn('No status change method available');
        }
    } catch (e) {
        console.warn('Could not set status listener:', e);
    }
}

function handleWalletStatusChange(wallet) {
    if (wallet) {
        console.log('✅ Wallet connected:', wallet);
        updateWalletUI(wallet);
        selectedWallet = wallet;
        showNotification(`✅ تم ربط محفظة ${wallet.device?.appName || 'TON'} بنجاح`, 'success');
        closeWalletModal();
        
        const walletInfo = {
            address: wallet.account.address,
            provider: wallet.device?.appName || 'tonconnect',
            connectedAt: getFormattedDate()
        };
        localStorage.setItem('connected_wallet', JSON.stringify(walletInfo));
        
    } else {
        console.log('Wallet disconnected');
        document.getElementById('walletInfo').style.display = 'none';
        document.getElementById('connectTonWalletBtn').innerHTML = '<i class="fas fa-wallet"></i> ربط محفظة TON';
        document.getElementById('walletAddress').value = '';
        document.getElementById('walletProvider').value = '';
        selectedWallet = null;
        
        localStorage.removeItem('connected_wallet');
    }
}

async function checkExistingConnection() {
    try {
        if (!tonConnect) return;
        
        if (typeof tonConnect.isConnected === 'function') {
            const connected = await tonConnect.isConnected();
            if (connected && tonConnect.wallet) {
                updateWalletUI(tonConnect.wallet);
                selectedWallet = tonConnect.wallet;
            }
        } else {
            const savedWallet = localStorage.getItem('connected_wallet');
            if (savedWallet) {
                try {
                    const walletInfo = JSON.parse(savedWallet);
                    await tonConnect.restoreConnection();
                    if (tonConnect.wallet) {
                        updateWalletUI(tonConnect.wallet);
                        selectedWallet = tonConnect.wallet;
                    }
                } catch (e) {
                    console.warn('Could not restore connection:', e);
                }
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
   Wallet Selection Modal
============================================================ */

function showWalletSelection() {
    if (isConnecting) {
        showNotification('🔄 جاري الاتصال بالفعل...', 'warning');
        return;
    }
    
    if (!tonConnect) {
        showNotification('🔄 جاري تهيئة TON Connect...', 'warning');
        initTonConnect();
        setTimeout(() => {
            if (tonConnect) {
                showWalletSelectionModal();
            } else {
                showNotification('❌ فشل تهيئة TON Connect. حاول تحديث الصفحة.', 'error');
            }
        }, 2000);
    } else {
        showWalletSelectionModal();
    }
}

function showWalletSelectionModal() {
    const modal = document.getElementById('wallet-modal');
    const walletsList = document.getElementById('wallets-list');
    
    if (!modal || !walletsList) {
        console.error('Modal elements not found');
        return;
    }
    
    walletsList.innerHTML = SUPPORTED_WALLETS.map(wallet => `
        <div class="wallet-item" onclick="connectWallet('${wallet.name}')">
            <div class="wallet-item-icon">
                <span>${wallet.name[0]}</span>
            </div>
            <div class="wallet-item-info">
                <div class="wallet-item-name">${wallet.name}</div>
                <div class="wallet-item-desc">انقر للاتصال</div>
            </div>
            <i class="fas fa-chevron-left" style="color:#4dd0ff;"></i>
        </div>
    `).join('');
    
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeWalletModal() {
    const modal = document.getElementById('wallet-modal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

async function connectWallet(walletName) {
    if (!tonConnect) {
        showNotification('❌ TON Connect غير مهيئ', 'error');
        return;
    }
    
    if (isConnecting) {
        showNotification('🔄 جاري الاتصال بالفعل...', 'warning');
        return;
    }
    
    try {
        isConnecting = true;
        closeWalletModal();
        showNotification(`🔄 جاري الاتصال بـ ${walletName}...`, 'success');
        
        const selectedWalletConfig = SUPPORTED_WALLETS.find(w => w.name === walletName);
        
        if (!selectedWalletConfig) {
            throw new Error('Wallet not found');
        }
        
        if (typeof tonConnect.connect === 'function') {
            await tonConnect.connect();
        } else {
            await tonConnect.send('connect', { wallets: [selectedWalletConfig] });
        }
        
    } catch (error) {
        console.error('Error connecting wallet:', error);
        
        let errorMessage = 'فشل الاتصال بالمحفظة';
        if (error.message.includes('timeout')) {
            errorMessage = 'انتهت مهلة الاتصال';
        } else if (error.message.includes('rejected')) {
            errorMessage = 'تم رفض الاتصال من قبل المستخدم';
        } else if (error.message.includes('no wallet')) {
            errorMessage = 'لم يتم العثور على محفظة. تأكد من تثبيت المحفظة أولاً.';
        }
        
        showNotification(`❌ ${errorMessage}`, 'error');
    } finally {
        isConnecting = false;
    }
}

function checkWalletBeforePurchase() {
    const walletInfo = document.getElementById('walletInfo');
    if (!walletInfo || walletInfo.style.display !== 'block') {
        showNotification('⚠️ يجب ربط المحفظة أولاً قبل الشراء', 'warning');
        
        const sidebar = document.getElementById("sidebar");
        const overlay = document.getElementById("overlay");
        sidebar.classList.add("open");
        overlay.style.display = "block";
        
        setTimeout(() => {
            const walletSection = document.getElementById('ton-wallet-section');
            if (walletSection) {
                walletSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                walletSection.style.animation = 'pulse 0.5s ease';
                setTimeout(() => {
                    walletSection.style.animation = '';
                }, 500);
            }
        }, 300);
        
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
   Stars and Premium Functions
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
   Purchase Handlers
============================================================ */

async function handleStarsPurchase() {
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
    
    showNotification(`🔄 جاري معالجة طلب ${amount} نجمة...`, 'success');
    
    if (tonConnect && selectedWallet) {
        try {
            const payload = base64Encode(`STARS_PURCHASE:${username}:${amount}:${orderId}:${Date.now()}`);
            const messages = [{
                address: RECEIVER_WALLET,
                amount: toNano(tonAmount),
                payload: payload
            }];
            const validUntil = Math.floor(Date.now() / 1000) + 10 * 60;
            
            await tonConnect.sendTransaction({
                validUntil: validUntil,
                messages: messages
            });
            
            showNotification(`✅ تم شراء ${amount} نجمة بنجاح!`, 'success');
            
            saveOrder({
                type: 'stars',
                username: username,
                amount: amount,
                tonAmount: tonAmount,
                orderId: orderId,
                status: 'completed',
                date: getFormattedDate()
            });
            
        } catch (error) {
            console.error('Transaction error:', error);
            showNotification('❌ فشل إتمام المعاملة', 'error');
        }
    }
}

async function handlePremiumPurchase() {
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
    
    showNotification(`🔄 جاري معالجة طلب ${planName}...`, 'success');
    
    if (tonConnect && selectedWallet) {
        try {
            const payload = base64Encode(`PREMIUM_PURCHASE:${username}:${planName}:${orderId}:${Date.now()}`);
            const messages = [{
                address: RECEIVER_WALLET,
                amount: toNano(tonAmount),
                payload: payload
            }];
            const validUntil = Math.floor(Date.now() / 1000) + 10 * 60;
            
            await tonConnect.sendTransaction({
                validUntil: validUntil,
                messages: messages
            });
            
            showNotification(`✅ تم شراء ${planName} بنجاح!`, 'success');
            
            saveOrder({
                type: 'premium',
                username: username,
                plan: planName,
                tonAmount: tonAmount,
                orderId: orderId,
                status: 'completed',
                date: getFormattedDate()
            });
            
        } catch (error) {
            console.error('Transaction error:', error);
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
   Responsive Enhancements
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
    
    setTimeout(() => {
        initTonConnect();
    }, 1000);
    
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
            closeWalletModal();
            closeSidebar();
        }
    });
    
    const modals = ['wallet-modal'];
    modals.forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.addEventListener('touchmove', (e) => {
                e.preventDefault();
            }, { passive: false });
        }
    });
});

/* ============================================================
   Export functions for global use
============================================================ */

window.showWalletSelection = showWalletSelection;
window.connectWallet = connectWallet;
window.closeWalletModal = closeWalletModal;
window.toggleSidebar = toggleSidebar;
window.closeSidebar = closeSidebar;
