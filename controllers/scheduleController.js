const db = require('../config/db');

// Ambil semua sesi, join dengan event untuk dapat event_name
exports.getAllSessions = async () => {
    const [rows] = await db.query(`
        SELECT 
            s.id,
            s.start_time,
            s.end_time,
            s.booking_open_time,
            e.name AS event_name
        FROM sessions s
        LEFT JOIN events e ON s.event_id = e.id
        ORDER BY s.start_time DESC
    `);
    return rows;
};

// Ambil satu sesi berdasarkan id
exports.getSessionById = async (id) => {
    const [rows] = await db.query('SELECT * FROM sessions WHERE id = ?', [id]);
    return rows[0];
};

// Update sesi
exports.updateSession = async (id, data) => {
    await db.query(
        'UPDATE sessions SET start_time=?, end_time=?, booking_open_time=? WHERE id=?',
        [data.start_time, data.end_time, data.booking_open_time, id]
    );
};

// Hapus sesi
exports.deleteSession = async (id) => {
    await db.query('DELETE FROM sessions WHERE id=?', [id]);
};