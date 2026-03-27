/* ============================================================
   starGo - Final Version with TON Payment Verification
   ============================================================ */

const RECEIVER_WALLET = "UQBPpnRDUyTVXzJk4Qxr02z4iPFZfWv8NC2fvOjHe8UtmpHE";

/* حل مشكلة 405 */
const API_BASE_URL = window.location.origin;

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
        notification.remove();
    }, 3000);
}

/* ============================================================
   TON Connect
   ============================================================ */

function initTonConnect() {
    if (typeof window.TON_CONNECT_UI === 'undefined') {
        setTimeout(initTonConnect, 1000);
        return;
    }

    tonConnectUI = new window.TON_CONNECT_UI.TonConnectUI({
        manifestUrl: window.location.origin + '/tonconnect-manifest.json'
    });

    tonConnectUI.onStatusChange((wallet) => {
        if (wallet) {
            document.getElementById('walletAddress').value = wallet.account.address;
            document.getElementById('walletInfo').style.display = 'block';
        }
    });
}

/* ============================================================
   Order API
   ============================================================ */

async function createOrderOnServer(type, data) {
    const endpoint = type === 'stars'
        ? '/api/order/stars'
        : '/api/order/premium';

    const res = await fetch(API_BASE_URL + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    if (!res.ok) {
        throw new Error('HTTP ' + res.status);
    }

    const json = await res.json();
    if (!json.success) throw new Error(json.message);

    return json.data.order_id;
}

async function verifyPaymentOnServer(orderId, txHash, tonAmount) {
    const res = await fetch(API_BASE_URL + '/api/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            order_id: orderId,
            tx_hash: txHash,
            ton_amount: tonAmount
        })
    });

    return await res.json();
}

/* ============================================================
   Buy Stars
   ============================================================ */

async function buyStars() {
    const username = document.getElementById("user-name").innerText;
    const amount = document.getElementById("stars-amount").value;

    if (!username) {
        showNotification("ادخل اسم المستخدم", "error");
        return;
    }

    const TON_PER_STAR = 0.0099273;
    const tonAmount = (amount * TON_PER_STAR).toFixed(4);

    let orderId;

    try {
        orderId = await createOrderOnServer('stars', {
            recipient: username.replace('@', ''),
            amount: parseInt(amount),
            ton_amount: parseFloat(tonAmount)
        });
    } catch (e) {
        showNotification("فشل إنشاء الطلب: " + e.message, "error");
        return;
    }

    const tx = await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [
            {
                address: RECEIVER_WALLET,
                amount: toNano(tonAmount),
                payload: base64Encode(orderId)
            }
        ]
    });

    const verify = await verifyPaymentOnServer(orderId, tx.boc, tonAmount);

    if (verify.success) {
        showNotification("تم الدفع بنجاح", "success");
    } else {
        showNotification("فشل التحقق", "error");
    }
}

/* ============================================================
   Init
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    initTonConnect();
});
