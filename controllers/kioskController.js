const Booking = require('../models/Booking');
const Notification = require('../models/Notification');
const Event = require('../models/Event');
const db = require('../config/db'); 

exports.showCheckinPage = (req, res) => {
    // Ambil status dari query URL untuk menampilkan pesan
    const { status, name, code } = req.query;
    res.render('kiosk/checkin', {
        title: 'Kiosk Check-in',
        status,
        name,
        code,
        path: req.originalUrl// Tambahkan path untuk navigasi
    });
};

exports.processCheckin = async (req, res) => {
    try {
        const { reservationCode } = req.body;
        const kioskId = req.session.user.id; // Ambil ID Kiosk dari session
        const result = await Booking.findByCodeAndCheckIn(reservationCode, kioskId); // Kirim ID Kiosk

        if (result.status === 'success') {
            await Notification.create({
                user_id: result.booking.user_id, // Ambil user_id dari hasil check-in
                message: `Tiket Anda (${reservationCode}) berhasil di-scan untuk check-in.`,
                link: '/history'
            });
        }

        // Redirect kembali ke halaman check-in dengan membawa hasil
        res.redirect(`/kiosk/checkin?status=${result.status}&name=${encodeURIComponent(result.name || '')}&code=${reservationCode}`);

    } catch (error) {
        console.error(error);
        res.redirect(`/kiosk/checkin?status=error`);
    }
};
exports.showCheckinHistory = async (req, res) => {
    try {
        const kioskId = req.session.user.id;
        const checkins = await Booking.findByKioskId(kioskId);
        res.render('kiosk/history', {
            title: 'Riwayat Check-in',
            path: req.originalUrl,
            checkins
        });
    } catch (error) {
        console.error("Failed to fetch Kiosk history:", error);
        res.status(500).send("Server Error");
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

        const checkins = await Booking.findByKioskIdPaginated(kioskId, filters);
        const totalItems = await Booking.countByKioskId(kioskId, filters);
        const totalPages = Math.ceil(totalItems / 8);
        const events = await Event.getAll(); // Ambil semua event untuk filter

        // Jika ini adalah permintaan AJAX (dari script), kirim hanya tabelnya
        if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
            return res.render('kiosk/partials/history-table', { 
                checkins, currentPage: page, totalPages 
            });
        }
        
        // Render halaman lengkap saat pertama kali dibuka
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