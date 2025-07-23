const db = require('../config/db');

class Booking {
    static async create(bookingData) {
        // Fungsi untuk membuat kode reservasi unik
        const generateReservationCode = () => {
            const prefix = 'RES';
            const timestamp = Date.now().toString().slice(-6);
            const random = Math.floor(100 + Math.random() * 900); // Angka acak 3 digit
            return `${prefix}-${timestamp}${random}`;
        };
        
        const newBooking = {
            session_id: bookingData.session_id,
            user_id: bookingData.user_id,
            booking_type: 'PUBLIC',
            reservation_code: generateReservationCode()
        };

        const sql = 'INSERT INTO bookings SET ?';
        const [result] = await db.query(sql, newBooking);
        return result.insertId; // Mengembalikan ID booking yang baru dibuat
    }
    static async create(bookingData, connection = db) { // Terima connection
    const generateReservationCode = () => {
        const prefix = 'RES';
        const timestamp = Date.now().toString().slice(-6);
        const random = Math.floor(100 + Math.random() * 900);
        return `${prefix}-${timestamp}${random}`;
    };
    
    const newBooking = {
        session_id: bookingData.session_id,
        user_id: bookingData.user_id,
        booking_type: bookingData.booking_type || 'PUBLIC',
        booked_by_pic_id: bookingData.booked_by_pic_id || null,
        reservation_code: generateReservationCode()
    };

    const sql = 'INSERT INTO bookings SET ?';
    await connection.query(sql, newBooking); // Gunakan connection
    
    return newBooking.reservation_code; // Kembalikan kodenya
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
                b.reservation_code, b.status, b.created_at,
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
    static async findByPicId(picId) {
    const sql = `
        SELECT 
            b.reservation_code,
            u.name as user_name,
            e.name as event_name,
            s.start_time
        FROM bookings b
        JOIN users u ON b.user_id = u.id
        JOIN sessions s ON b.session_id = s.id
        JOIN events e ON s.event_id = e.id
        WHERE b.booked_by_pic_id = ?
        ORDER BY b.created_at DESC
    `;
    const [rows] = await db.query(sql, [picId]);
    return rows;
}
static async findByKioskId(kioskId) {
    const sql = `
        SELECT 
            b.reservation_code,
            b.checkin_time,
            u.name as user_name,
            e.name as event_name,
            s.start_time
        FROM bookings b
        JOIN users u ON b.user_id = u.id
        JOIN sessions s ON b.session_id = s.id
        JOIN events e ON s.event_id = e.id
        WHERE b.checked_in_by_kiosk_id = ?
        ORDER BY b.checkin_time DESC
    `;
    const [rows] = await db.query(sql, [kioskId]);
    return rows;
}
}

module.exports = Booking;