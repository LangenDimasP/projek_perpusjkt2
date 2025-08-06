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
    
        let whereConditions = [];
    
        // Filter event
        if (eventFilter === 'immersif') {
            whereConditions.push("e.name = ?");
            params.push('Immersif');
        } else if (eventFilter === 'others') {
            whereConditions.push("e.name != ?");
            params.push('Immersif');
        }
    
        // Filter bulan dan tahun
        if (month && year) {
            whereConditions.push("MONTH(s.start_time) = ? AND YEAR(s.start_time) = ?");
            params.push(month, year);
        }
    
        // Filter sesi yang belum berakhir
        whereConditions.push("s.end_time >= NOW()");
    
        if (whereConditions.length > 0) {
            sql += " WHERE " + whereConditions.join(" AND ");
        }
    
        sql += " ORDER BY s.start_time ASC";
    
        const [rows] = await db.query(sql, params);
        return rows;
    }

static async delete(eventId) {
    // Deleting an event will also delete its sessions because of "ON DELETE CASCADE" in the database
    const sql = "DELETE FROM events WHERE id = ?";
    await db.query(sql, [eventId]);
}
}

module.exports = Event;