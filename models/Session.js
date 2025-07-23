const db = require('../config/db');

class Session {
    static async create(sessionData) {
        const sql = 'INSERT INTO sessions SET ?';
        await db.query(sql, sessionData);
    }

    static async findById(id) {
        const sql = 'SELECT * FROM sessions WHERE id = ?';
        const [rows] = await db.query(sql, [id]);
        return rows[0];
    }

    static async decrementPublicQuota(id, connection = db) {
        const sql = 'UPDATE sessions SET public_quota = public_quota - 1 WHERE id = ? AND public_quota > 0';
        const [result] = await connection.query(sql, [id]);
        return result.affectedRows;
    }

    static async getForPic() {
    const sql = `
        SELECT s.*, e.name as event_name 
        FROM sessions s
        JOIN events e ON s.event_id = e.id
        WHERE s.internal_quota > 0 
        AND s.internal_allocation_closed = false 
        AND s.start_time >= NOW() 
        ORDER BY s.start_time ASC
    `;
    const [rows] = await db.query(sql);
    return rows;
}


    static async decrementInternalQuota(id) {
        const sql = 'UPDATE sessions SET internal_quota = internal_quota - 1 WHERE id = ? AND internal_quota > 0';
        const [result] = await db.query(sql, [id]);
        return result.affectedRows;
    }

    static async getAttendeesById(sessionId) {
        const sql = `
            SELECT 
                b.reservation_code, b.booking_type, b.status,
                u.name as user_name, u.email as user_email,
                pic.name as pic_name 
            FROM bookings b
            JOIN users u ON b.user_id = u.id
            LEFT JOIN users pic ON b.booked_by_pic_id = pic.id
            WHERE b.session_id = ? AND b.status != 'CANCELLED'
            ORDER BY b.booking_type, u.name
        `;
        const [rows] = await db.query(sql, [sessionId]);
        return rows;
    }
    
    // TAMBAHKAN FUNGSI BARU INI
    static async findByEventId(eventId) {
        const sql = 'SELECT * FROM sessions WHERE event_id = ? AND start_time >= NOW() ORDER BY start_time ASC';
        const [rows] = await db.query(sql, [eventId]);
        return rows;
    }
    static async checkTimeOverlap(eventId, startTime, endTime) {
    // Jika input waktu tidak valid, jangan lakukan pengecekan
    if (!startTime || !endTime) {
        return 0;
    }
    const sql = `
        SELECT COUNT(id) as count 
        FROM sessions 
        WHERE event_id = ? 
        AND start_time < ? 
        AND end_time > ?
    `;
    const [rows] = await db.query(sql, [eventId, endTime, startTime]);
    return rows[0].count;
}

}


module.exports = Session;