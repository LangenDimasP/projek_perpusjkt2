const db = require('../config/db');

class Booking {
    static async create(bookingData, connection = db) {
    // Fungsi internal untuk membuat kode reservasi yang unik
    const generateReservationCode = () => {
        const prefix = 'RES';
        const timestamp = Date.now().toString().slice(-6); // 6 digit terakhir dari timestamp
        const random = Math.floor(100 + Math.random() * 900); // Angka acak 3 digit
        return `${prefix}-${timestamp}${random}`;
    };
    
    // Siapkan objek data untuk dimasukkan ke database
    const newBooking = {
        session_id: bookingData.session_id,
        user_id: bookingData.user_id,
        booking_type: bookingData.booking_type || 'PUBLIC', // Defaultnya 'PUBLIC'
        booked_by_pic_id: bookingData.booked_by_pic_id || null,
        reservation_code: generateReservationCode(),
        group_size: bookingData.group_size || 1 // Simpan ukuran grup, defaultnya 1
    };

    const sql = 'INSERT INTO bookings SET ?';
    // Jalankan kueri menggunakan koneksi yang diberikan (penting untuk transaksi)
    await connection.query(sql, newBooking);
    
    // Kembalikan kode reservasi yang baru dibuat agar bisa digunakan di controller
    return newBooking.reservation_code;
}
    static async findByCodeAndCheckIn(reservationCode, kioskId) {
        const sqlFind = `
            SELECT b.*, u.name as user_name, s.start_time, s.end_time 
            FROM bookings b
            JOIN users u ON b.user_id = u.id
            JOIN sessions s ON b.session_id = s.id
            WHERE b.reservation_code = ?
        `;
        const [bookings] = await db.query(sqlFind, [reservationCode]);
        const booking = bookings[0];

        if (!booking) {
            return { status: 'not_found' };
        }
        if (booking.status === 'CHECKED_IN') {
            return { status: 'already_checked_in', name: booking.user_name, booking };
        }
        if (booking.status === 'CANCELLED') {
            return { status: 'cancelled', name: booking.user_name, booking };
        }

        const sqlUpdate = 'UPDATE bookings SET status = "CHECKED_IN", checkin_time = NOW(), checked_in_by_kiosk_id = ? WHERE id = ?';
        await db.query(sqlUpdate, [kioskId, booking.id]);

        return { status: 'success', name: booking.user_name, booking: booking };
    }

    static async findByUserId(userId) {
    const sql = `
        SELECT 
            b.reservation_code, b.status, b.created_at, b.group_size, -- <-- TAMBAHKAN INI
            s.start_time, s.end_time,
            e.name as event_name, e.location
        FROM bookings b
        JOIN sessions s ON b.session_id = s.id
        JOIN events e ON s.event_id = e.id
        WHERE b.user_id = ?
        ORDER BY b.created_at DESC
    `;
    const [rows] = await db.query(sql, [userId]);
    return rows;
}
static async checkOverlap(userId, newSessionId) {
        // 1. Ambil waktu mulai & selesai dari sesi BARU yang akan dibooking
        const sqlGetNewSession = 'SELECT start_time, end_time FROM sessions WHERE id = ?';
        const [newSessions] = await db.query(sqlGetNewSession, [newSessionId]);
        if (newSessions.length === 0) return false; // Sesi tidak ditemukan
        const { start_time: newStart, end_time: newEnd } = newSessions[0];

        // 2. Ambil semua sesi LAMA yang sudah dibooking oleh user
        const sqlGetExisting = `
            SELECT s.start_time, s.end_time 
            FROM bookings b
            JOIN sessions s ON b.session_id = s.id
            WHERE b.user_id = ? AND b.status = 'CONFIRMED'
        `;
        const [existingBookings] = await db.query(sqlGetExisting, [userId]);

        // 3. Cek tumpang tindih
        for (const booking of existingBookings) {
            const { start_time: existingStart, end_time: existingEnd } = booking;
            // Logika overlap: (MulaiBaru < SelesaiLama) DAN (SelesaiBaru > MulaiLama)
            if (newStart < existingEnd && newEnd > existingStart) {
                return true; // Ditemukan tumpang tindih!
            }
        }

        return false; // Aman, tidak ada tumpang tindih
    }
   static async findByPicIdPaginated(picId, filters = {}) {
    const { query, type, date, page = 1 } = filters;
    const limit = 10;
    const offset = (page - 1) * limit;

    let sql = `
        SELECT 
            b.reservation_code, b.group_size,
            u.name as user_name, e.name as event_name, s.start_time
        FROM bookings b
        JOIN users u ON b.user_id = u.id
        JOIN sessions s ON b.session_id = s.id
        JOIN events e ON s.event_id = e.id
        WHERE b.booked_by_pic_id = ?
    `;
    const params = [picId];

    // --- PERUBAHAN DI SINI ---
    if (query) {
        // Now searches in user's name OR reservation code
        sql += " AND (u.name LIKE ? OR b.reservation_code LIKE ?)";
        params.push(`%${query}%`, `%${query}%`);
    }
    // --- SELESAI ---

    if (type === 'group') {
        sql += " AND b.group_size > 1";
    } else if (type === 'individual') {
        sql += " AND b.group_size = 1";
    }
    if (date) {
        sql += " AND DATE(b.created_at) = ?";
        params.push(date);
    }

    sql += " ORDER BY b.created_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const [rows] = await db.query(sql, params);
    return rows;
}

// This function gets the total count for pagination
static async countByPicId(picId, filters = {}) {
    const { query, type, date } = filters;
    let sql = "SELECT COUNT(b.id) as total FROM bookings b JOIN users u ON b.user_id = u.id WHERE b.booked_by_pic_id = ?";
    const params = [picId];

    // --- PERUBAHAN DI SINI ---
    if (query) {
        // Now searches in user's name OR reservation code
        sql += " AND (u.name LIKE ? OR b.reservation_code LIKE ?)";
        params.push(`%${query}%`, `%${query}%`);
    }
    // --- SELESAI ---

    if (type === 'group') {
        sql += " AND b.group_size > 1";
    } else if (type === 'individual') {
        sql += " AND b.group_size = 1";
    }
    if (date) {
        sql += " AND DATE(b.created_at) = ?";
        params.push(date);
    }

    const [rows] = await db.query(sql, params);
    return rows[0].total;
}
static async findByKioskIdPaginated(kioskId, filters = {}) {
    const { query, eventId, page = 1 } = filters;
    const limit = 8; // Data per halaman
    const offset = (page - 1) * limit;

    let sql = `
        SELECT 
            b.reservation_code, b.checkin_time,
            u.name as user_name, e.name as event_name
        FROM bookings b
        JOIN users u ON b.user_id = u.id
        JOIN sessions s ON b.session_id = s.id
        JOIN events e ON s.event_id = e.id
        WHERE b.checked_in_by_kiosk_id = ?
    `;
    const params = [kioskId];

    if (query) {
        sql += " AND (u.name LIKE ? OR b.reservation_code LIKE ?)";
        params.push(`%${query}%`, `%${query}%`);
    }
    if (eventId && eventId !== 'all') {
        sql += " AND e.id = ?";
        params.push(eventId);
    }

    sql += " ORDER BY b.checkin_time DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const [rows] = await db.query(sql, params);
    return rows;
}

// Fungsi ini menghitung total data untuk pagination
static async countByKioskId(kioskId, filters = {}) {
    const { query, eventId } = filters;
    let sql = `
        SELECT COUNT(b.id) as total 
        FROM bookings b
        JOIN users u ON b.user_id = u.id
        JOIN events e ON b.session_id = e.id
        WHERE b.checked_in_by_kiosk_id = ?
    `;
    const params = [kioskId];

    if (query) {
        sql += " AND (u.name LIKE ? OR b.reservation_code LIKE ?)";
        params.push(`%${query}%`, `%${query}%`);
    }
    if (eventId && eventId !== 'all') {
        sql += " AND e.id = ?";
        params.push(eventId);
    }

    const [rows] = await db.query(sql, params);
    return rows[0].total;
}
static async findCheckinHistoryPaginated(kioskId, filters) {
    const { query, eventId, page } = filters;
    const limit = 8;
    const offset = (page - 1) * limit;

    let sql = `
    SELECT 
        b.*, 
        u.name AS user_name, 
        e.name AS event_name,
        s.public_quota, 
        s.internal_quota,
        s.total_quota,        
        b.booking_type,
        (
            SELECT COUNT(*) FROM bookings 
            WHERE session_id = b.session_id 
            AND booking_type = b.booking_type 
            AND checkin_time IS NOT NULL
        ) as checked_in_count
    FROM bookings b
    JOIN users u ON b.user_id = u.id
    JOIN sessions s ON b.session_id = s.id
    JOIN events e ON s.event_id = e.id
    WHERE b.checked_in_by_kiosk_id = ?
`;
    const params = [kioskId];

    if (eventId && eventId !== 'all') {
        sql += " AND e.id = ?";
        params.push(eventId);
    }

    if (query && query.trim() !== '') {
        sql += " AND (u.name LIKE ? OR b.reservation_code LIKE ?)";
        params.push(`%${query}%`, `%${query}%`);
    }

    // Urutkan dari yang paling awal check-in
    sql += " ORDER BY b.checkin_time DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const [rows] = await db.query(sql, params);
    return rows;
}

static async countCheckinHistory(kioskId, filters = {}) {
    const { query, eventId } = filters;
    let sql = `
        SELECT COUNT(b.id) as total
        FROM bookings b
        JOIN users u ON b.user_id = u.id
        JOIN sessions s ON b.session_id = s.id
        JOIN events e ON s.event_id = e.id
        WHERE b.status = 'CHECKED_IN'
          AND b.checked_in_by_kiosk_id = ?
    `;
    const params = [kioskId];

    if (query) {
        sql += " AND u.name LIKE ?";
        params.push(`%${query}%`);
    }
    if (eventId && eventId !== 'all') {
        sql += " AND e.id = ?";
        params.push(eventId);
    }

    const [rows] = await db.query(sql, params);
    return rows[0].total;
}
}

module.exports = Booking;