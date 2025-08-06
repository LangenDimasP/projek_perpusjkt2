const Booking = require('../models/Booking');
const Notification = require('../models/Notification');
const Event = require('../models/Event');
const db = require('../config/db'); 

exports.showCheckinPage = (req, res) => {
    // Ambil status dari query URL untuk menampilkan pesan
    const { status, name, code, quota, eventName, sessionTime, quotaType } = req.query;
    res.render('kiosk/checkin', {
        title: 'Kiosk Check-in',
        status,
        name,
        code,
        quota,
        eventName,
        sessionTime,
        quotaType, // <-- tambahkan ini
        path: req.originalUrl
    });
};

exports.processCheckin = async (req, res) => {
    try {
        const { reservationCode } = req.body;
        const kioskId = req.session.user.id;
        const result = await Booking.findByCodeAndCheckIn(reservationCode, kioskId);

        let remainingQuota = null;
        let eventName = '';
        let sessionTime = '';
        let quotaType = '';
        if (result.status === 'success' && result.booking) {
            const sessionId = result.booking.session_id;
            const bookingType = result.booking.booking_type; // 'PUBLIC' atau 'INTERNAL'
            quotaType = bookingType === 'PUBLIC' ? 'Publik' : 'Internal';
        
            // Ambil total kuota dari session
            const [session] = await db.query('SELECT public_quota, internal_quota, start_time, event_id FROM sessions WHERE id = ?', [sessionId]);
            let totalQuota = (session[0]?.public_quota || 0) + (session[0]?.internal_quota || 0);
            
            // Hitung jumlah booking yang SUDAH check-in untuk seluruh sesi (semua tipe booking)
            const [countResult] = await db.query(
                "SELECT COUNT(*) as checkedIn FROM bookings WHERE session_id = ? AND checkin_time IS NOT NULL AND status != 'CANCELLED'",
                [sessionId]
            );
            const checkedIn = countResult[0]?.checkedIn || 0;
            remainingQuota = totalQuota - checkedIn;
            if (remainingQuota < 0) remainingQuota = 0;
        
            sessionTime = session[0]?.start_time ? new Date(session[0].start_time).toLocaleString('id-ID') : '';
            const [event] = await db.query('SELECT name FROM events WHERE id = ?', [session[0].event_id]);
            eventName = event[0]?.name || '';
            await Notification.create({
                user_id: result.booking.user_id,
                message: `Tiket Anda (${reservationCode}) berhasil di-scan untuk check-in.`,
                link: '/history'
            });
        }

        res.redirect(`/kiosk/checkin?status=${result.status}&name=${encodeURIComponent(result.name || '')}&code=${reservationCode}&quota=${remainingQuota}&eventName=${encodeURIComponent(eventName)}&sessionTime=${encodeURIComponent(sessionTime)}&quotaType=${encodeURIComponent(quotaType)}`);

    } catch (error) {
        console.error(error);
        res.redirect(`/kiosk/checkin?status=error`);
    }
};

exports.showCheckinHistory = async (req, res) => {
    try {
        const kioskId = req.session.user.id;
        const page = parseInt(req.query.page, 10) || 1;
        const filters = {
            query: req.query.query || '',
            eventId: req.query.eventId || 'all',
            page: page
        };

        // Ambil data check-in, pastikan group_size ikut diambil
        const checkins = await Booking.findCheckinHistoryPaginated(kioskId, filters);
        const totalItems = await Booking.countCheckinHistory(kioskId, filters);
        const totalPages = Math.ceil(totalItems / 8);
        const events = await Event.getAll();

        // Jika permintaan AJAX, render hanya tabelnya
        if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
            return res.render('kiosk/partials/history-table', { 
                checkins, currentPage: page, totalPages 
            });
        }
        
        // Render halaman lengkap
        res.render('kiosk/history', {
            title: 'Riwayat Check-in',
            path: req.originalUrl,
            checkins,
            currentPage: page,
            totalPages,
            events,
            filters
        });
    } catch (error) {
        console.error("Failed to fetch Kiosk history:", error);
        res.status(500).send("Server Error");
    }
};
exports.showKioskDashboard = async (req, res) => {
    try {
        const kioskId = req.session.user.id;

        // --- Data untuk Kartu Statistik (tetap sama) ---
        const [today] = await db.query("SELECT COUNT(id) as count FROM bookings WHERE checked_in_by_kiosk_id = ? AND DATE(checkin_time) = CURDATE()", [kioskId]);
        const [week] = await db.query("SELECT COUNT(id) as count FROM bookings WHERE checked_in_by_kiosk_id = ? AND checkin_time >= CURDATE() - INTERVAL 7 DAY", [kioskId]);
        const [total] = await db.query("SELECT COUNT(id) as count FROM bookings WHERE checked_in_by_kiosk_id = ?", [kioskId]);

        const stats = {
            checkinsToday: today[0]?.count || 0,
            checkinsWeek: week[0]?.count || 0,
            checkinsTotal: total[0]?.count || 0,
        };

        // --- Data untuk Chart ---
        // 1. Chart Check-in per Jam Hari Ini (tetap sama)
        const [hourlyData] = await db.query("SELECT HOUR(checkin_time) as hour, COUNT(id) as count FROM bookings WHERE checked_in_by_kiosk_id = ? AND DATE(checkin_time) = CURDATE() GROUP BY HOUR(checkin_time) ORDER BY hour ASC", [kioskId]);
        const hourlyLabels = hourlyData.map(row => `${String(row.hour).padStart(2, '0')}:00`);
        const hourlyCounts = hourlyData.map(row => row.count);

        // 2. Chart Proporsi Event yang Ditangani (tetap sama)
        const [eventData] = await db.query("SELECT e.name, COUNT(b.id) as count FROM bookings b JOIN sessions s ON b.session_id = s.id JOIN events e ON s.event_id = e.id WHERE b.checked_in_by_kiosk_id = ? GROUP BY e.name ORDER BY count DESC", [kioskId]);
        const eventLabels = eventData.map(row => row.name);
        const eventCounts = eventData.map(row => row.count);

        // --- 3. DATA BARU: Chart Check-in berdasarkan Tipe Booking (Bar Chart) ---
        const [typeData] = await db.query("SELECT booking_type, COUNT(id) as count FROM bookings WHERE checked_in_by_kiosk_id = ? GROUP BY booking_type", [kioskId]);
        const typeLabels = typeData.map(row => row.booking_type);
        const typeCounts = typeData.map(row => row.count);
        // --- SELESAI ---

        res.render('kiosk/dashboard', {
            title: 'Dashboard Kiosk',
            path: req.originalUrl,
            stats,
            hourlyLabels: JSON.stringify(hourlyLabels),
            hourlyData: JSON.stringify(hourlyCounts),
            eventLabels: JSON.stringify(eventLabels),
            eventData: JSON.stringify(eventCounts),
            // Kirim data baru ke view
            typeLabels: JSON.stringify(typeLabels),
            typeData: JSON.stringify(typeCounts),
        });

    } catch (error) {
        console.error("Error fetching Kiosk dashboard data:", error);
        // Tambahkan data kosong untuk variabel baru jika terjadi error
        res.render('kiosk/dashboard', {
            title: 'Dashboard Kiosk',
            path: req.originalUrl,
            stats: { checkinsToday: 0, checkinsWeek: 0, checkinsTotal: 0 },
            hourlyLabels: '[]', hourlyData: '[]',
            eventLabels: '[]', eventData: '[]',
            typeLabels: '[]', typeData: '[]', // Tambahkan ini
        });
    }
};
exports.showCheckinRecap = async (req, res) => {
    try {
        const { eventId = 'all', date = '', page = 1 } = req.query;
        const limit = 10;
        const offset = (parseInt(page, 10) - 1) * limit;

        // Ambil semua event untuk filter
        const events = await Event.getAll();

        // Query total sesi untuk pagination
        let countSql = `
            SELECT COUNT(*) as total
            FROM sessions s
            JOIN events e ON s.event_id = e.id
            WHERE 1=1
        `;
        const countParams = [];
        if (eventId !== 'all') {
            countSql += ' AND e.id = ?';
            countParams.push(eventId);
        }
        if (date) {
            countSql += ' AND DATE(s.start_time) = ?';
            countParams.push(date);
        }
        const [countRows] = await db.query(countSql, countParams);
        const totalItems = countRows[0]?.total || 0;
        const totalPages = Math.ceil(totalItems / limit);

        // Query sesi & rekap check-in (paginated)
        let sql = `
            SELECT 
                s.id as session_id,
                s.start_time,
                s.public_quota,
                s.internal_quota,
                s.total_quota,
                e.id as event_id,
                e.name as event_name,
                (
                    SELECT IFNULL(SUM(group_size), 0) FROM bookings 
                    WHERE session_id = s.id AND checkin_time IS NOT NULL AND status != 'CANCELLED'
                ) as checked_in_count
            FROM sessions s
            JOIN events e ON s.event_id = e.id
            WHERE 1=1
        `;
        const params = [];
        if (eventId !== 'all') {
            sql += ' AND e.id = ?';
            params.push(eventId);
        }
        if (date) {
            sql += ' AND DATE(s.start_time) = ?';
            params.push(date);
        }
        sql += ' ORDER BY s.start_time DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const [sessions] = await db.query(sql, params);

        res.render('kiosk/recap', {
            title: 'Rekap Check-in Event',
            path: req.originalUrl,
            events,
            sessions,
            filters: { eventId, date },
            currentPage: parseInt(page, 10),
            totalPages
        });
    } catch (error) {
        console.error("Failed to fetch check-in recap:", error);
        res.status(500).send("Server Error");
    }
};