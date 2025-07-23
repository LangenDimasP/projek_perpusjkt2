const db = require('../config/db');

class Notification {
    // Membuat notifikasi baru
    static async create(notificationData) {
        const sql = 'INSERT INTO notifications SET ?';
        await db.query(sql, notificationData);
    }

    // Mengambil semua notifikasi milik seorang user
    static async findByUserId(userId, filters = {}) {
    let sql = `
        SELECT * FROM notifications 
        WHERE user_id = ?
    `;
    const params = [userId];

    // Handle Date Filter
    if (filters.dateFilter === 'today') {
        sql += ' AND DATE(created_at) = CURDATE()';
    } else if (filters.dateFilter === 'week') {
        sql += ' AND created_at >= CURDATE() - INTERVAL 7 DAY';
    }

    // Handle Type Filter
    if (filters.typeFilter === 'booking') {
        sql += " AND message LIKE '%berhasil dibuat%'";
    } else if (filters.typeFilter === 'checkin') {
        sql += " AND message LIKE '%berhasil di-scan%'";
    }

    sql += ' ORDER BY created_at DESC';

    const [rows] = await db.query(sql, params);
    return rows;
}

    // Menghitung notifikasi yang belum dibaca
    static async getUnreadCount(userId) {
        const sql = 'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = false';
        const [rows] = await db.query(sql, [userId]);
        return rows[0].count;
    }

    // Menandai semua notifikasi user sebagai sudah dibaca
    static async markAllAsRead(userId) {
        const sql = 'UPDATE notifications SET is_read = true WHERE user_id = ? AND is_read = false';
        await db.query(sql, [userId]);
    }
}

module.exports = Notification;