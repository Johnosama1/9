/* ============================================================
   starGo - Full JavaScript File
   Version: 3.0 (Responsive)
   Author: starGo Team
============================================================ */

/* ============================================================
   Config & Wallet Settings
============================================================ */

// عنوان المحفظة الذي ستستلم عليه الفلوس (استبدله بعنوان محفظتك الفعلي)
const RECEIVER_WALLET = "UQBPpnRDUyTVXzJk4Qxr02z4iPFZfWv8NC2fvOjHe8UtmpHE"; // استبدل هذا بعنوان محفظتك

// قائمة المحافظ المدعومة - استخدام روابط موثوقة
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
let pendingVerification = null;
let selectedWallet = null;
let tonConnect = null;
let isConnecting = false;

/* ============================================================
   Helper Functions
============================================================ */

/**
 * تحويل كمية TON إلى Nano TON
 * @param {number} tonAmount - كمية TON
 * @returns {string} - الكمية بـ Nano TON
 */
function toNano(tonAmount) {
    return String(Math.floor(Number(tonAmount) * 1e9));
}

/**
 * تشفير نص إلى Base64
 * @param {string} str - النص المراد تشفيره
 * @returns {string} - النص المشفر
 */
function base64Encode(str) {
    try {
        return btoa(str);
    } catch (e) {
        return btoa(unescape(encodeURIComponent(str)));
    }
}

/**
 * تنسيق التاريخ
 * @returns {string} - التاريخ الحالي بتنسيق DD/MM/YYYY HH:MM
 */
function getFormattedDate() {
    const date = new Date();
    return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()} ${date.getHours()}:${date.getMinutes()}`;
}

/* ============================================================
   Notification Function
============================================================ */

/**
 * إظهار إشعار للمستخدم
 * @param {string} message - نص الرسالة
 * @param {string} type - نوع الإشعار (success, error, warning)
 */
function showNotification(message, type = 'success') {
    // إزالة أي إشعار سابق
    const oldNotification = document.querySelector('.notification');
    if (oldNotification) {
        oldNotification.remove();
    }
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    // اختيار الأيقونة المناسبة
    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-check-circle';
    if (type === 'error') icon = 'fa-exclamation-circle';
    if (type === 'warning') icon = 'fa-exclamation-triangle';
    
    notification.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
    document.body.appendChild(notification);
    
    // إخفاء الإشعار بعد 3 ثواني
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

/**
 * إنشاء manifest ديناميكي
 * @returns {object} - كائن manifest
 */
function createManifest() {
    const manifest = {
        url: window.location.origin,
        name: "starGo",
        iconUrl: window.location.origin + "/jmage.jpg",
        termsOfUseUrl: window.location.origin + "/terms.html",
        privacyPolicyUrl: window.location.origin + "/privacy.html"
    };
    
    // تخزين manifest في sessionStorage
    sessionStorage.setItem('tonconnect-manifest', JSON.stringify(manifest));
    
    return manifest;
}

/**
 * تهيئة TON Connect
 */
function initTonConnect() {
    try {
        // التحقق من وجود المكتبة
        if (typeof window.TonConnect === 'undefined') {
            console.warn('TonConnect SDK not loaded, attempting to load...');
            showNotification('🔄 جاري تحميل مكتبة TON Connect...', 'warning');
            
            // محاولة تحميل المكتبة مرة أخرى
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

/**
 * تهيئة TON Connect مع manifest
 */
function initializeTonConnectWithManifest() {
    try {
        // إنشاء manifest
        createManifest();
        
        // التحقق مما إذا كنا نعمل على localhost
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        
        // إنشاء عنوان manifest
        const manifestUrl = isLocalhost 
            ? window.location.origin + '/tonconnect-manifest.json'
            : 'https://' + window.location.hostname + '/tonconnect-manifest.json';
        
        // إنشاء كائن TonConnect
        tonConnect = new window.TonConnect.TonConnect({
            manifestUrl: manifestUrl,
            wallets: SUPPORTED_WALLETS
        });
        
        console.log('✅ TonConnect initialized successfully', tonConnect);
        
        // التحقق من وجود اتصال سابق
        setTimeout(() => {
            checkExistingConnection();
        }, 1000);
        
        // إضافة مستمع لحدث تغيير المحفظة
        setupWalletStatusListener();
        
    } catch (e) {
        console.error('❌ Error creating TonConnect instance:', e);
        showNotification('❌ فشل إنشاء اتصال TON', 'error');
    }
}

/**
 * إعداد مستمع حالة المحفظة
 */
function setupWalletStatusListener() {
    if (!tonConnect) return;
    
    try {
        // التحقق من الطريقة المتاحة
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

/**
 * معالجة تغيير حالة المحفظة
 * @param {object} wallet - كائن المحفظة
 */
function handleWalletStatusChange(wallet) {
    if (wallet) {
        console.log('✅ Wallet connected:', wallet);
        updateWalletUI(wallet);
        submitWalletData(wallet.account.address, wallet.device?.appName || 'tonconnect');
        selectedWallet = wallet;
        showNotification(`✅ تم ربط محفظة ${wallet.device?.appName || 'TON'} بنجاح`, 'success');
        closeWalletModal();
        
        // حفظ معلومات المحفظة في localStorage
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
        
        // إزالة معلومات المحفظة من localStorage
        localStorage.removeItem('connected_wallet');
    }
}

/**
 * التحقق من اتصال سابق
 */
async function checkExistingConnection() {
    try {
        if (!tonConnect) return;
        
        // محاولة استعادة الاتصال السابق
        if (typeof tonConnect.isConnected === 'function') {
            const connected = await tonConnect.isConnected();
            if (connected && tonConnect.wallet) {
                updateWalletUI(tonConnect.wallet);
                selectedWallet = tonConnect.wallet;
            }
        } else {
            // محاولة استعادة من localStorage
            const savedWallet = localStorage.getItem('connected_wallet');
            if (savedWallet) {
                try {
                    const walletInfo = JSON.parse(savedWallet);
                    // محاولة إعادة الاتصال
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

/**
 * تحديث واجهة المحفظة
 * @param {object} wallet - كائن المحفظة
 */
function updateWalletUI(wallet) {
    if (!wallet || !wallet.account) return;
    
    document.getElementById('walletAddress').value = wallet.account.address;
    document.getElementById('walletProvider').value = wallet.device?.appName || 'tonconnect';
    
    const shortAddress = wallet.account.address.substring(0, 8) + '...' + 
                        wallet.account.address.substring(wallet.account.address.length - 8);
    document.getElementById('connectedAddress').textContent = shortAddress;
    
    document.getElementById('walletInfo').style.display = 'block';
    document.getElementById('connectTonWalletBtn').innerHTML = '<i class="fas fa-check-circle"></i> المحفظة مربوطة';
    
    // محاولة الحصول على رصيد المحفظة
    getWalletBalance(wallet.account.address);
}

/**
 * الحصول على رصيد المحفظة
 * @param {string} address - عنوان المحفظة
 */
async function getWalletBalance(address) {
    try {
        // استخدام TON Center API مع fallback
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

/**
 * إظهار نافذة اختيار المحفظة
 */
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

/**
 * إظهار نافذة اختيار المحفظة
 */
function showWalletSelectionModal() {
    const modal = document.getElementById('wallet-modal');
    const walletsList = document.getElementById('wallets-list');
    
    if (!modal || !walletsList) {
        console.error('Modal elements not found');
        return;
    }
    
    // إنشاء قائمة المحافظ مع أيقونات
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
    
    // منع التمرير خلف النافذة
    document.body.style.overflow = 'hidden';
}

/**
 * إغلاق نافذة اختيار المحفظة
 */
function closeWalletModal() {
    const modal = document.getElementById('wallet-modal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

/**
 * الاتصال بمحفظة محددة
 * @param {string} walletName - اسم المحفظة
 */
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
        
        // العثور على المحفظة المحددة
        const selectedWalletConfig = SUPPORTED_WALLETS.find(w => w.name === walletName);
        
        if (!selectedWalletConfig) {
            throw new Error('Wallet not found');
        }
        
        // محاولة الاتصال بالمحفظة
        if (typeof tonConnect.connect === 'function') {
            await tonConnect.connect();
        } else {
            // طريقة بديلة للاتصال
            await tonConnect.send('connect', { wallets: [selectedWalletConfig] });
        }
        
    } catch (error) {
        console.error('Error connecting wallet:', error);
        
        // رسالة خطأ مخصصة حسب نوع الخطأ
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

/**
 * التحقق من ربط المحفظة قبل الشراء
 * @returns {boolean} - هل المحفظة مربوطة
 */
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

/**
 * إرسال بيانات المحفظة إلى السيرفر
 * @param {string} address - عنوان المحفظة
 * @param {string} provider - مزود المحفظة
 */
async function submitWalletData(address, provider) {
    try {
        const response = await fetch('connect_wallet.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                wallet_address: address,
                wallet_provider: provider,
                connected_at: getFormattedDate()
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            console.log('✅ تم ربط المحفظة بنجاح:', data);
        } else {
            console.error('❌ فشل ربط المحفظة:', data.error);
        }
    } catch (error) {
        console.error('❌ خطأ في الاتصال بالسيرفر:', error);
    }
}

/* ============================================================
   Login Functions
============================================================ */

/**
 * إرسال رمز التحقق
 */
async function sendVerificationCode() {
    const username = document.getElementById("login-username").value.trim();
    if (!username) {
        showNotification('❌ من فضلك أدخل اسم المستخدم', 'error');
        return;
    }
    
    let formattedUsername = username.startsWith('@') ? username.substring(1) : username;
    
    const sendBtn = document.getElementById('login-send');
    const originalText = sendBtn.innerHTML;
    sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإرسال...';
    sendBtn.disabled = true;
    
    try {
        // توليد رمز عشوائي 6 أرقام
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        
        pendingVerification = {
            username: formattedUsername,
            code: verificationCode,
            timestamp: Date.now()
        };
        
        // محاكاة تأخير الشبكة
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        showNotification(`📱 تم إرسال الرمز ${verificationCode} إلى ${formattedUsername}`, 'success');
        
        document.getElementById('login-send').style.display = 'none';
        document.getElementById('code-input-container').style.display = 'block';
        document.getElementById('login-msg').innerText = `تم إرسال رمز التحقق إلى @${formattedUsername}`;
        document.getElementById('login-link-wrap').style.display = 'block';
        document.getElementById('login-code').value = verificationCode;
        
    } catch (error) {
        console.error('Error sending code:', error);
        showNotification('❌ فشل إرسال رمز التحقق', 'error');
    } finally {
        sendBtn.innerHTML = originalText;
        sendBtn.disabled = false;
    }
}

/**
 * التحقق من الكود
 */
function verifyCode() {
    const enteredCode = document.getElementById('login-code').value.trim();
    
    if (!enteredCode) {
        showNotification('❌ من فضلك أدخل الكود', 'error');
        return;
    }
    
    if (!pendingVerification) {
        showNotification('❌ لا توجد عملية تحقق نشطة', 'error');
        return;
    }
    
    // التحقق من صلاحية الكود (5 دقائق)
    const timeElapsed = Date.now() - pendingVerification.timestamp;
    if (timeElapsed > 5 * 60 * 1000) {
        showNotification('❌ انتهت صلاحية الكود، أعد المحاولة', 'error');
        resetLoginForm();
        return;
    }
    
    if (enteredCode === pendingVerification.code) {
        // تسجيل الدخول بنجاح
        const userObj = {
            telegram_id: Math.floor(10000000 + Math.random() * 90000000).toString(),
            telegram_username: '@' + pendingVerification.username,
            logged_in_at: getFormattedDate()
        };
        
        localStorage.setItem("stellagram_user", JSON.stringify(userObj));
        setLoggedUI(userObj);
        
        showNotification(`✅ مرحباً ${userObj.telegram_username}`, 'success');
        
        setTimeout(() => {
            closeLogin();
            resetLoginForm();
        }, 1500);
    } else {
        showNotification('❌ الكود غير صحيح، حاول مرة أخرى', 'error');
    }
}

/**
 * إعادة تعيين نموذج تسجيل الدخول
 */
function resetLoginForm() {
    document.getElementById('login-username').value = '';
    document.getElementById('login-code').value = '';
    document.getElementById('login-send').style.display = 'block';
    document.getElementById('code-input-container').style.display = 'none';
    document.getElementById('login-link-wrap').style.display = 'none';
    document.getElementById('login-status').style.display = 'none';
    pendingVerification = null;
}

/**
 * فتح نافذة تسجيل الدخول
 */
function openLogin() {
    closeSidebar();
    resetLoginForm();
    document.getElementById("login-popup").style.display = "flex";
    document.body.style.overflow = 'hidden';
}

/**
 * إغلاق نافذة تسجيل الدخول
 */
function closeLogin() {
    document.getElementById("login-popup").style.display = "none";
    document.body.style.overflow = '';
    resetLoginForm();
}

/* ============================================================
   UI Functions
============================================================ */

/**
 * تبديل القائمة الجانبية
 */
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

/**
 * إغلاق القائمة الجانبية
 */
function closeSidebar() {
    const sb = document.getElementById("sidebar");
    const ov = document.getElementById("overlay");
    sb.classList.remove("open");
    ov.style.display = "none";
    document.body.style.overflow = '';
}

/**
 * تحديث واجهة المستخدم بعد تسجيل الدخول
 * @param {object} userObj - كائن المستخدم
 */
function setLoggedUI(userObj) {
    try {
        const loginBtn = document.getElementById("login-btn");
        if (loginBtn) loginBtn.style.display = "none";
        
        const ui = document.getElementById("user-info");
        if (ui) ui.style.display = "block";
        
        if (userObj.telegram_username) {
            const sname = document.getElementById("sidebar-username");
            if (sname) sname.innerText = userObj.telegram_username;
            
            const avatar = document.getElementById("sidebar-avatar");
            if (avatar) {
                const firstChar = userObj.telegram_username.replace('@', '').charAt(0).toUpperCase();
                avatar.src = 'data:image/svg+xml,' + encodeURIComponent(`
                    <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
                        <rect width="40" height="40" fill="#2c4b6c" rx="8"/>
                        <text x="20" y="25" font-size="20" text-anchor="middle" fill="#aaccff" font-family="Arial">${firstChar}</text>
                    </svg>
                `);
            }
        }
        
        if (userObj.telegram_id) {
            const sid = document.getElementById("sidebar-id");
            if (sid) sid.innerText = "ID: " + userObj.telegram_id;
        }
        
    } catch (e) {
        console.error(e);
    }
}

/**
 * تحديث واجهة المستخدم بعد تسجيل الخروج
 */
function setLoggedOutUI() {
    try {
        const loginBtn = document.getElementById("login-btn");
        if (loginBtn) loginBtn.style.display = "block";
        
        const ui = document.getElementById("user-info");
        if (ui) ui.style.display = "none";
        
        const userCard = document.getElementById("user-card");
        if (userCard) userCard.style.display = "none";
        
        const userInputContainer = document.getElementById("user-input-container");
        if (userInputContainer) userInputContainer.style.display = "flex";
        
    } catch (e) {
        console.error(e);
    }
}

/**
 * تحديث واجهة المستخدم حسب حالة تسجيل الدخول
 * @returns {object|null} - كائن المستخدم أو null
 */
function refreshLoginUI() {
    try {
        const raw = localStorage.getItem("stellagram_user");
        if (!raw) {
            setLoggedOutUI();
            return null;
        }
        const user = JSON.parse(raw);
        setLoggedUI(user);
        return user;
    } catch (e) {
        setLoggedOutUI();
        return null;
    }
}

/**
 * تأكيد تسجيل الخروج
 */
function confirmLogout() {
    closeSidebar();
    document.getElementById('logout-confirm-popup').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

/**
 * إغلاق نافذة تأكيد تسجيل الخروج
 */
function closeConfirmPopup() {
    document.getElementById('logout-confirm-popup').style.display = 'none';
    document.body.style.overflow = '';
}

/**
 * تسجيل الخروج
 */
function logout() {
    localStorage.removeItem("stellagram_user");
    closeConfirmPopup();
    setLoggedOutUI();
    showNotification('✅ تم تسجيل الخروج بنجاح', 'success');
}

/* ============================================================
   Stars and Premium Functions
============================================================ */

/**
 * إعداد النقر على الباقات
 */
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

/**
 * إعداد اختيار الخطط المميزة
 */
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

/**
 * جلب سعر TON
 */
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
        // استخدام سعر افتراضي
        window.tonPrice = 5.5;
        updatePackages();
        updatePremiumPrices();
        calculateCustomAmount();
    }
}

/**
 * تحديث أسعار الباقات
 */
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

/**
 * تحديث أسعار الخطط المميزة
 */
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

/**
 * حساب الكمية المخصصة
 */
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

/**
 * معالجة شراء النجوم
 */
async function handleStarsPurchase() {
    if (!checkWalletBeforePurchase()) {
        return;
    }
    
    const userData = refreshLoginUI();
    if (!userData) {
        showNotification('⚠️ يجب تسجيل الدخول أولاً', 'warning');
        openLogin();
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
    
    // إنشاء معاملة TON
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
            
            // حفظ الطلب
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

/**
 * معالجة شراء Premium
 */
async function handlePremiumPurchase() {
    if (!checkWalletBeforePurchase()) {
        return;
    }
    
    const userData = refreshLoginUI();
    if (!userData) {
        showNotification('⚠️ يجب تسجيل الدخول أولاً', 'warning');
        openLogin();
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
            
            // حفظ الطلب
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

/**
 * حفظ الطلب
 * @param {object} order - كائن الطلب
 */
function saveOrder(order) {
    try {
        // الحصول على الطلبات السابقة
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

/**
 * التحقق من نوع الجهاز وإضافة كلاسات مناسبة
 */
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
    
    // إضافة كلاس للـ Touch devices
    if ('ontouchstart' in window) {
        document.body.classList.add('touch-device');
    }
}

/**
 * ضبط ارتفاع الشاشة للموبايل (لـ iOS)
 */
function setVHVariable() {
    let vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
}

/**
 * إغلاق القائمة الجانبية عند النقر خارجها على الموبايل
 */
function setupMobileGestures() {
    // إغلاق بالسحب للخلف (للموبايل)
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
        
        // إذا كان السحب لليمين (إغلاق القائمة)
        if (touchEndX - touchStartX > 50) {
            closeSidebar();
        }
    }
}

/**
 * تحسين النماذج للموبايل
 */
function enhanceMobileForms() {
    // منع تكبير الشاشة عند التركيز على الحقول
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

/**
 * تحسين القوائم المنسدلة للموبايل
 */
function enhanceMobileDropdowns() {
    const modal = document.getElementById('wallet-modal');
    if (modal) {
        modal.addEventListener('touchmove', (e) => {
            e.stopPropagation();
        }, { passive: false });
    }
}

/**
 * إضافة زر العودة للقائمة الجانبية
 */
function addSidebarBackButton() {
    const sidebar = document.getElementById('sidebar');
    
    // إزالة الزر القديم إذا وجد
    const oldBtn = document.querySelector('.sidebar-close-btn');
    if (oldBtn) oldBtn.remove();
    
    // إضافة زر إغلاق للقائمة الجانبية على الموبايل
    if (window.innerWidth <= 768) {
        const closeBtn = document.createElement('button');
        closeBtn.className = 'sidebar-close-btn';
        closeBtn.innerHTML = '<i class="fas fa-arrow-right"></i>';
        closeBtn.onclick = closeSidebar;
        closeBtn.setAttribute('aria-label', 'إغلاق القائمة');
        
        sidebar.insertBefore(closeBtn, sidebar.firstChild);
    }
}

/**
 * تحسين النقر على العناصر للموبايل
 */
function enhanceMobileClicks() {
    // منع التأخير في النقر على الموبايل
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

/**
 * تحسين التمرير للمحتوى الطويل
 */
function enhanceScrolling() {
    const scrollableElements = document.querySelectorAll('#sidebar, .wallet-modal-body, .packages-container');
    
    scrollableElements.forEach(el => {
        el.addEventListener('touchmove', (e) => {
            e.stopPropagation();
        }, { passive: true });
    });
}

/**
 * التحقق من الاتصال بالإنترنت
 */
function checkOnlineStatus() {
    window.addEventListener('online', () => {
        showNotification('✅ تم استعادة الاتصال بالإنترنت', 'success');
    });
    
    window.addEventListener('offline', () => {
        showNotification('❌ لا يوجد اتصال بالإنترنت', 'error');
    });
}

/**
 * حفظ البيانات محلياً للعمل بدون إنترنت
 */
function enableOfflineSupport() {
    // حفظ آخر طلب في localStorage
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

/**
 * تهيئة جميع تحسينات الموبايل
 */
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
    
    // إعادة حساب VH عند تغيير حجم النافذة
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
    
    // تهيئة الأساسيات
    fetchTonPrice();
    setInterval(fetchTonPrice, 30000); // تحديث كل 30 ثانية
    setupPackageClick();
    setupPremiumSelect();
    refreshLoginUI();
    
    // تهيئة TON Connect بعد قليل
    setTimeout(() => {
        initTonConnect();
    }, 1000);
    
    // تهيئة تحسينات الموبايل
    initMobileEnhancements();
    
    // تبديل التبويبات
    document.querySelectorAll(".tab-btn").forEach((tab, i) => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".tab-btn").forEach(t => t.classList.remove("active"));
            document.querySelectorAll(".content-box").forEach(c => c.style.display = "none");
            tab.classList.add("active");
            const boxes = document.querySelectorAll(".content-box");
            if (boxes[i]) boxes[i].style.display = "block";
        });
    });
    
    // إرسال اسم المستخدم للنجوم
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
    
    // إزالة المستخدم
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
    
    // إدخال كمية النجوم
    const starsAmountInput = document.getElementById("stars-amount");
    if (starsAmountInput) starsAmountInput.addEventListener("input", calculateCustomAmount);
    
    // زر شراء النجوم
    const starsContinueBtn = document.getElementById('stars-continue-btn');
    if (starsContinueBtn) {
        starsContinueBtn.addEventListener("click", handleStarsPurchase);
    }
    
    // زر شراء Premium
    const premiumContinueBtn = document.getElementById('premium-continue-btn');
    if (premiumContinueBtn) {
        premiumContinueBtn.addEventListener("click", handlePremiumPurchase);
    }
    
    // إرسال اسم المستخدم لـ Premium
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
    
    // إزالة المستخدم لـ Premium
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
    
    // أزرار تسجيل الدخول
    const loginSendBtn = document.getElementById('login-send');
    if (loginSendBtn) {
        loginSendBtn.addEventListener('click', sendVerificationCode);
    }
    
    const verifyCodeBtn = document.getElementById('verify-code-btn');
    if (verifyCodeBtn) {
        verifyCodeBtn.addEventListener('click', verifyCode);
    }
    
    const codeInput = document.getElementById('login-code');
    if (codeInput) {
        codeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                verifyCode();
            }
        });
    }
    
    // إغلاق النوافذ المنبثقة عند الضغط على ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeWalletModal();
            closeLogin();
            closeConfirmPopup();
            closeSidebar();
        }
    });
    
    // منع التمرير عند فتح النوافذ المنبثقة
    const modals = ['wallet-modal', 'login-popup', 'logout-confirm-popup'];
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

// جعل الدوال متاحة عالمياً
window.showWalletSelection = showWalletSelection;
window.connectWallet = connectWallet;
window.closeWalletModal = closeWalletModal;
window.openLogin = openLogin;
window.closeLogin = closeLogin;
window.confirmLogout = confirmLogout;
window.closeConfirmPopup = closeConfirmPopup;
window.logout = logout;
window.toggleSidebar = toggleSidebar;
window.closeSidebar = closeSidebar;

// دالة لحفظ بيانات المستخدم بعد تسجيل الدخول
async function saveUserToDatabase(userData) {
    try {
        const response = await fetch('save_user.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(userData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            console.log('✅ User saved to database:', data);
            // حفظ user_id في الجلسة
            if (data.user_id) {
                sessionStorage.setItem('user_id', data.user_id);
            }
        } else {
            console.error('❌ Failed to save user:', data.error);
        }
    } catch (error) {
        console.error('❌ Error saving user:', error);
    }
}

// تعديل دالة verifyCode لإرسال البيانات
function verifyCode() {
    const enteredCode = document.getElementById('login-code').value.trim();
    
    if (!enteredCode) {
        showNotification('❌ من فضلك أدخل الكود', 'error');
        return;
    }
    
    if (!pendingVerification) {
        showNotification('❌ لا توجد عملية تحقق نشطة', 'error');
        return;
    }
    
    // التحقق من صلاحية الكود (5 دقائق)
    const timeElapsed = Date.now() - pendingVerification.timestamp;
    if (timeElapsed > 5 * 60 * 1000) {
        showNotification('❌ انتهت صلاحية الكود، أعد المحاولة', 'error');
        resetLoginForm();
        return;
    }
    
    if (enteredCode === pendingVerification.code) {
        // تسجيل الدخول بنجاح
        const userObj = {
            telegram_id: Math.floor(10000000 + Math.random() * 90000000).toString(),
            telegram_username: '@' + pendingVerification.username,
            logged_in_at: getFormattedDate(),
            ip_address: 'تم التقاطه تلقائياً', // السيرفر سيأخذ IP
            user_agent: navigator.userAgent
        };
        
        localStorage.setItem("stellagram_user", JSON.stringify(userObj));
        setLoggedUI(userObj);
        
        // حفظ في قاعدة البيانات
        saveUserToDatabase(userObj);
        
        showNotification(`✅ مرحباً ${userObj.telegram_username}`, 'success');
        
        setTimeout(() => {
            closeLogin();
            resetLoginForm();
        }, 1500);
    } else {
        showNotification('❌ الكود غير صحيح، حاول مرة أخرى', 'error');
    }
}

// تعديل دالة handleStarsPurchase لحفظ الطلب
async function handleStarsPurchase() {
    if (!checkWalletBeforePurchase()) {
        return;
    }
    
    const userData = refreshLoginUI();
    if (!userData) {
        showNotification('⚠️ يجب تسجيل الدخول أولاً', 'warning');
        openLogin();
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
    const usdAmount = tonAmount * (window.tonPrice || 5.5);
    const orderId = "ORD-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7).toUpperCase();
    
    showNotification(`🔄 جاري معالجة طلب ${amount} نجمة...`, 'success');
    
    // حفظ الطلب في قاعدة البيانات أولاً
    const orderData = {
        type: 'stars',
        user_id: sessionStorage.getItem('user_id'),
        recipient_username: username,
        amount: amount,
        ton_amount: tonAmount,
        usd_amount: usdAmount + FIXED_FEE,
        order_id: orderId,
        wallet_address: document.getElementById('walletAddress').value
    };
    
    try {
        // حفظ الطلب
        const saveResponse = await fetch('save_order.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(orderData)
        });
        
        const saveResult = await saveResponse.json();
        
        if (!saveResult.success) {
            throw new Error('فشل حفظ الطلب');
        }
        
        // إنشاء معاملة TON
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
                
                // تحديث حالة الطلب
                await fetch('update_order_status.php', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        order_id: orderId,
                        status: 'completed',
                        transaction_hash: 'تمت المعاملة'
                    })
                });
                
            } catch (error) {
                console.error('Transaction error:', error);
                showNotification('❌ فشل إتمام المعاملة', 'error');
                
                // تحديث حالة الطلب إلى فشل
                await fetch('update_order_status.php', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        order_id: orderId,
                        status: 'failed'
                    })
                });
            }
        }
    } catch (error) {
        console.error('Error saving order:', error);
        showNotification('❌ فشل حفظ الطلب', 'error');
    }
}
