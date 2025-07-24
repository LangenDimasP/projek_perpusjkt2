const db = require('../config/db');

class Session {
    static async create(sessionData) {
        const sql = 'INSERT INTO sessions SET ?';
        await db.query(sql, sessionData);
    }

   static async findById(id) {
    // Kueri baru yang menggabungkan tabel sessions dan events
    const sql = `
        SELECT 
            s.*, 
            e.name as event_name 
        FROM sessions s
        JOIN events e ON s.event_id = e.id
        WHERE s.id = ?
    `;
    const [rows] = await db.query(sql, [id]);
    return rows[0];
}

    static async decrementPublicQuota(id, connection = db) {
        const sql = 'UPDATE sessions SET public_quota = public_quota - 1 WHERE id = ? AND public_quota > 0';
        const [result] = await connection.query(sql, [id]);
        return result.affectedRows;
    }

    static async getForPic(filters = {}) {
    const { eventFilter, month, year } = filters;

    let sql = `
        SELECT s.*, e.name as event_name 
        FROM sessions s
        JOIN events e ON s.event_id = e.id
    `;
    const params = [];
    let whereConditions = [
        "s.internal_quota > 0",
        "s.internal_allocation_closed = false"
    ];

    // Terapkan filter event
    if (eventFilter && eventFilter.toLowerCase() === 'immersif') {
        whereConditions.push("LOWER(e.name) = ?");
        params.push('immersif');
    } else if (eventFilter && eventFilter.toLowerCase() === 'others') {
        whereConditions.push("LOWER(e.name) != ?");
        params.push('immersif');
    }

    // Terapkan filter bulan dan tahun
    if (month && year) {
        whereConditions.push("MONTH(s.start_time) = ? AND YEAR(s.start_time) = ?");
        params.push(month, year);
    } else {
        // Default jika tidak ada filter waktu
        whereConditions.push("s.start_time >= NOW()");
    }

    sql += " WHERE " + whereConditions.join(" AND ");
    sql += " ORDER BY s.start_time ASC";

    const [rows] = await db.query(sql, params);
    return rows;
}


    static async decrementInternalQuota(id, count = 1, connection = db) { // Tambahkan parameter count
    const sql = 'UPDATE sessions SET internal_quota = internal_quota - ? WHERE id = ? AND internal_quota >= ?';
    const [result] = await connection.query(sql, [count, id, count]); // Gunakan count
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
static async getPaginated(filters = {}) {
    const { query, eventId, date, page = 1 } = filters;
    const limit = 8; // 8 data per halaman
    const offset = (page - 1) * limit;

    let sql = `
        SELECT s.*, e.name as event_name
        FROM sessions s JOIN events e ON s.event_id = e.id
    `;
    const params = [];
    let whereConditions = [];

    if (query) {
        whereConditions.push("e.name LIKE ?");
        params.push(`%${query}%`);
    }
    if (eventId && eventId !== 'all') {
        whereConditions.push("e.id = ?");
        params.push(eventId);
    }
    if (date) {
        whereConditions.push("DATE(s.start_time) = ?");
        params.push(date);
    }

    if (whereConditions.length > 0) {
        sql += " WHERE " + whereConditions.join(" AND ");
    }

    sql += " ORDER BY s.start_time DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const [rows] = await db.query(sql, params);
    return rows;
}

// Menghitung total sesi untuk pagination
static async countAll(filters = {}) {
    const { query, eventId, date } = filters;
    let sql = "SELECT COUNT(s.id) as total FROM sessions s JOIN events e ON s.event_id = e.id";
    const params = [];
    let whereConditions = [];

    if (query) { /* ... (kondisi sama seperti di atas) ... */ }
    if (eventId && eventId !== 'all') { /* ... */ }
    if (date) { /* ... */ }
    // (Anda bisa salin blok if dari fungsi di atas ke sini)

    if (whereConditions.length > 0) {
        sql += " WHERE " + whereConditions.join(" AND ");
    }
    
    const [rows] = await db.query(sql, params);
    return rows[0].total;
}
static async getAttendeesByIdPaginated(sessionId, page = 1) {
    const limit = 10;
    const offset = (page - 1) * limit;
    const sql = `
        SELECT 
            b.reservation_code, b.booking_type, b.status, b.group_size,
            u.name as user_name, u.email as user_email, pic.name as pic_name 
        FROM bookings b
        JOIN users u ON b.user_id = u.id
        LEFT JOIN users pic ON b.booked_by_pic_id = pic.id
        WHERE b.session_id = ? AND b.status != 'CANCELLED'
        ORDER BY b.booking_type, u.name
        LIMIT ? OFFSET ?
    `;
    const [rows] = await db.query(sql, [sessionId, limit, offset]);
    return rows;
}

static async countAttendeesById(sessionId) {
    const sql = "SELECT COUNT(id) as total FROM bookings WHERE session_id = ? AND status != 'CANCELLED'";
    const [rows] = await db.query(sql, [sessionId]);
    return rows[0].total;
}
static async update(sessionId, sessionData) {
    const sql = "UPDATE sessions SET ? WHERE id = ?";
    await db.query(sql, [sessionData, sessionId]);
}

static async delete(sessionId) {
    const sql = "DELETE FROM sessions WHERE id = ?";
    await db.query(sql, [sessionId]);
}
}


module.exports = Session;