const db = require('../config/db');

class Event {
    static async create(eventData) {
        const { name, location, description } = eventData;
        const sql = 'INSERT INTO events (name, location, description) VALUES (?, ?, ?)';
        await db.query(sql, [name, location, description]);
    }

    static async getAll() {
        const sql = 'SELECT * FROM events ORDER BY created_at DESC';
        const [rows] = await db.query(sql);
        return rows;
    }

    // PERBAIKAN: Mengambil SEMUA event beserta sesinya
    static async getWithSessions() {
        const sql = `
            SELECT 
                e.id as event_id, e.name as event_name, e.location, e.description,
                s.id as session_id, s.start_time, s.end_time, 
                s.public_quota, s.internal_quota, s.total_quota,
                s.booking_open_time, s.status
            FROM events e
            LEFT JOIN sessions s ON e.id = s.event_id 
            AND DATE(s.start_time) >= CURDATE()
            ORDER BY e.created_at DESC, s.start_time ASC
        `;
        const [rows] = await db.query(sql);
        return rows;
    }

    static async findById(id) {
        const sql = 'SELECT * FROM events WHERE id = ?';
        const [rows] = await db.query(sql, [id]);
        return rows[0];
    }
    
    static async findByName(name) {
        const sql = 'SELECT * FROM events WHERE name = ? LIMIT 1';
        const [rows] = await db.query(sql, [name]);
        return rows[0];
    }

    // PERBAIKAN: Kueri yang benar untuk event selain 'Immersif'
    static async findOthers() {
        const sql = "SELECT * FROM events WHERE name != 'Immersif' ORDER BY created_at DESC";
        const [rows] = await db.query(sql);
        return rows;
    }
    static async getFiltered(filters = {}) {
        const { eventFilter, month, year } = filters;

        let sql = `
            SELECT 
                e.id as event_id, e.name, e.location, e.description,
                s.id as session_id, s.start_time, s.end_time, 
                s.public_quota, s.internal_quota, s.total_quota,
                s.booking_open_time, s.status
            FROM events e
            JOIN sessions s ON e.id = s.event_id
        `;
        const params = [];

        // Gabungkan kondisi WHERE
        let whereConditions = [];

        // Filter berdasarkan event (Immersif atau lainnya)
        if (eventFilter === 'immersif') {
            whereConditions.push("e.name = ?");
            params.push('Immersif');
        } else if (eventFilter === 'others') {
            whereConditions.push("e.name != ?");
            params.push('Immersif');
        }

        // Filter berdasarkan bulan dan tahun
        if (month && year) {
            whereConditions.push("MONTH(s.start_time) = ? AND YEAR(s.start_time) = ?");
            params.push(month, year);
        } else {
            // Default jika tidak ada filter waktu: tampilkan sesi mulai hari ini
            whereConditions.push("DATE(s.start_time) >= CURDATE()");
        }

        if (whereConditions.length > 0) {
            sql += " WHERE " + whereConditions.join(" AND ");
        }

        sql += " ORDER BY s.start_time ASC";

        const [rows] = await db.query(sql, params);
        return rows;
    }
}

module.exports = Event;