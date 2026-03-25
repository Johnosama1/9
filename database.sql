-- إنشاء قاعدة البيانات
CREATE DATABASE IF NOT EXISTS stargo_db;
USE stargo_db;

-- جدول المستخدمين
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    telegram_username VARCHAR(100) UNIQUE NOT NULL,
    wallet_address VARCHAR(255),
    login_count INT DEFAULT 1,
    first_login DATETIME,
    last_login DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- جدول طلبات النجوم
CREATE TABLE IF NOT EXISTS stars_orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    recipient_username VARCHAR(100),
    stars_amount INT,
    ton_amount DECIMAL(10,4),
    order_id VARCHAR(100) UNIQUE,
    status ENUM('pending', 'completed', 'failed') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- جدول طلبات Premium
CREATE TABLE IF NOT EXISTS premium_orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    recipient_username VARCHAR(100),
    plan_name VARCHAR(50),
    ton_amount DECIMAL(10,4),
    order_id VARCHAR(100) UNIQUE,
    status ENUM('pending', 'completed', 'failed') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);