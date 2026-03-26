-- إنشاء قاعدة البيانات
CREATE DATABASE IF NOT EXISTS stargo_db;
USE stargo_db;

-- ============================================
-- جدول المستخدمين
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    telegram_username VARCHAR(100) UNIQUE NOT NULL,
    wallet_address VARCHAR(255),
    login_count INT DEFAULT 1,
    first_login DATETIME,
    last_login DATETIME,
    wallet_connected_at DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- جدول طلبات النجوم
-- ============================================
CREATE TABLE IF NOT EXISTS stars_orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    recipient_username VARCHAR(100),
    stars_amount INT,
    ton_amount DECIMAL(10,4),
    order_id VARCHAR(100) UNIQUE,
    status ENUM('pending', 'paid', 'completed', 'failed', 'cancelled') DEFAULT 'pending',
    tx_hash VARCHAR(100) NULL,
    paid_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================
-- جدول طلبات Premium
-- ============================================
CREATE TABLE IF NOT EXISTS premium_orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    recipient_username VARCHAR(100),
    plan_name VARCHAR(50),
    ton_amount DECIMAL(10,4),
    order_id VARCHAR(100) UNIQUE,
    status ENUM('pending', 'paid', 'completed', 'failed', 'cancelled') DEFAULT 'pending',
    tx_hash VARCHAR(100) NULL,
    paid_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================
-- جدول حفظ التحقق من المدفوعات
-- ============================================
CREATE TABLE IF NOT EXISTS payment_verifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id VARCHAR(100) NOT NULL,
    tx_hash VARCHAR(100) NOT NULL,
    status ENUM('confirmed', 'rejected', 'pending') DEFAULT 'pending',
    details JSON,
    verified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tx_hash (tx_hash),
    INDEX idx_order_id (order_id)
);

-- ============================================
-- التحديثات التلقائية (تشتغل لو الأعمدة مش موجودة)
-- ============================================

-- إضافة wallet_connected_at لجدول users لو مش موجود
SET @exist := (SELECT COUNT(*) FROM information_schema.columns 
               WHERE table_name = 'users' AND column_name = 'wallet_connected_at' AND table_schema = DATABASE());
SET @sql := IF(@exist = 0, 'ALTER TABLE users ADD COLUMN wallet_connected_at DATETIME', 'SELECT "Column already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- إضافة tx_hash لجدول stars_orders لو مش موجود
SET @exist := (SELECT COUNT(*) FROM information_schema.columns 
               WHERE table_name = 'stars_orders' AND column_name = 'tx_hash' AND table_schema = DATABASE());
SET @sql := IF(@exist = 0, 'ALTER TABLE stars_orders ADD COLUMN tx_hash VARCHAR(100) NULL', 'SELECT "Column already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- إضافة paid_at لجدول stars_orders لو مش موجود
SET @exist := (SELECT COUNT(*) FROM information_schema.columns 
               WHERE table_name = 'stars_orders' AND column_name = 'paid_at' AND table_schema = DATABASE());
SET @sql := IF(@exist = 0, 'ALTER TABLE stars_orders ADD COLUMN paid_at TIMESTAMP NULL', 'SELECT "Column already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- إضافة tx_hash لجدول premium_orders لو مش موجود
SET @exist := (SELECT COUNT(*) FROM information_schema.columns 
               WHERE table_name = 'premium_orders' AND column_name = 'tx_hash' AND table_schema = DATABASE());
SET @sql := IF(@exist = 0, 'ALTER TABLE premium_orders ADD COLUMN tx_hash VARCHAR(100) NULL', 'SELECT "Column already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- إضافة paid_at لجدول premium_orders لو مش موجود
SET @exist := (SELECT COUNT(*) FROM information_schema.columns 
               WHERE table_name = 'premium_orders' AND column_name = 'paid_at' AND table_schema = DATABASE());
SET @sql := IF(@exist = 0, 'ALTER TABLE premium_orders ADD COLUMN paid_at TIMESTAMP NULL', 'SELECT "Column already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
