const Event = require('../models/Event');
const Session = require('../models/Session');
const Booking = require('../models/Booking');
const db = require('../config/db');
const User = require('../models/User'); 
const Notification = require('../models/Notification');

// Menampilkan halaman utama dengan filter
exports.showHomePage = async (req, res) => {
    try {
        const { filter, month, year } = req.query;
        const eventFilter = filter || 'immersif';

        // Panggil fungsi baru dengan semua filter
        const results = await Event.getFiltered({ eventFilter, month, year });

        // Proses data untuk mengelompokkan sesi di bawah event
        const eventsMap = new Map();
        results.forEach(row => {
            if (!eventsMap.has(row.event_id)) {
                eventsMap.set(row.event_id, {
                    id: row.event_id,
                    name: row.name,
                    location: row.location,
                    description: row.description,
                    sessions: []
                });
            }
            if (row.session_id) {
                // Mapping session agar ada field 'id'
                eventsMap.get(row.event_id).sessions.push({
                    id: row.session_id, // <-- ini penting!
                    start_time: row.start_time,
                    public_quota: row.public_quota,
                    status: row.status,
                    booking_open_time: row.booking_open_time,
                    // tambahkan field lain yang dibutuhkan di EJS
                });
            }
        });

        
        res.render('index', {
            title: 'Jadwal Reservasi',
            path: req.originalUrl,
            events: Array.from(eventsMap.values()),
            currentFilter: eventFilter,
            currentMonth: parseInt(month) || new Date().getMonth() + 1,
            currentYear: parseInt(year) || new Date().getFullYear()
        });

    } catch (error) {
        console.error(error);
        res.status(500).send("Server Error");
    }
};

exports.showUserDashboard = async (req, res) => {
    try {
        const userId = req.session.user.id;

        // --- Data untuk Kartu Statistik ---
        const [upcoming] = await db.query("SELECT COUNT(id) as count FROM bookings WHERE user_id = ? AND status = 'CONFIRMED' AND session_id IN (SELECT id FROM sessions WHERE start_time >= NOW())", [userId]);
        const [past] = await db.query("SELECT COUNT(id) as count FROM bookings WHERE user_id = ? AND (status = 'CHECKED_IN' OR session_id IN (SELECT id FROM sessions WHERE start_time < NOW()))", [userId]);
        const [total] = await db.query("SELECT COUNT(id) as count FROM bookings WHERE user_id = ?", [userId]);
        
        const stats = {
            upcomingBookings: upcoming[0]?.count || 0,
            pastBookings: past[0]?.count || 0,
            totalBookings: total[0]?.count || 0,
        };

        // --- Data untuk Chart ---
        // 1. Chart Aktivitas Bulanan (Bar Chart)
        const [monthlyData] = await db.query("SELECT MONTH(created_at) as month, COUNT(id) as count FROM bookings WHERE user_id = ? AND YEAR(created_at) = YEAR(CURDATE()) GROUP BY MONTH(created_at) ORDER BY month ASC", [userId]);
        const monthlyCounts = Array(12).fill(0);
        monthlyData.forEach(row => {
            monthlyCounts[row.month - 1] = row.count;
        });
        const monthLabels = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];

        // 2. Chart Event Favorit (Pie Chart)
        const [favoriteData] = await db.query("SELECT e.name, COUNT(b.id) as count FROM bookings b JOIN sessions s ON b.session_id = s.id JOIN events e ON s.event_id = e.id WHERE b.user_id = ? GROUP BY e.name ORDER BY count DESC LIMIT 5", [userId]);
        const favoriteLabels = favoriteData.map(row => row.name);
        const favoriteCounts = favoriteData.map(row => row.count);

        // 3. Chart Status Booking (Doughnut Chart)
        const [statusData] = await db.query("SELECT status, COUNT(id) as count FROM bookings WHERE user_id = ? GROUP BY status", [userId]);
        const statusLabels = statusData.map(row => row.status);
        const statusCounts = statusData.map(row => row.count);

        res.render('user-dashboard', {
            title: 'Dashboard Saya',
            path: req.originalUrl,
            stats,
            monthlyLabels: JSON.stringify(monthLabels),
            monthlyData: JSON.stringify(monthlyCounts),
            favoriteLabels: JSON.stringify(favoriteLabels),
            favoriteData: JSON.stringify(favoriteCounts),
            statusLabels: JSON.stringify(statusLabels),
            statusData: JSON.stringify(statusCounts)
        });
    } catch (error) {
        console.error("Error fetching user dashboard data:", error);
        // Kirim data kosong jika terjadi error
        res.render('user-dashboard', {
            title: 'Dashboard Saya',
            path: req.originalUrl,
            stats: { upcomingBookings: 0, pastBookings: 0, totalBookings: 0 },
            monthlyLabels: '[]', monthlyData: '[]',
            favoriteLabels: '[]', favoriteData: '[]',
            statusLabels: '[]', statusData: '[]'
        });
    }
};

// Mengambil detail sesi untuk modal pop-up
exports.getSessionDetails = async (req, res) => {
    try {
        const session = await Session.findById(req.params.id);
        if (!session || session.public_quota <= 0) {
            return res.status(404).json({ message: 'Sesi tidak ditemukan atau kuota habis.' });
        }

        let expirationTime;
        if (req.session.bookingExpires && req.session.bookingExpires > Date.now()) {
            expirationTime = req.session.bookingExpires;
        } else {
            expirationTime = Date.now() + (1 * 60 * 1000); 
            req.session.bookingExpires = expirationTime;
        }

        res.json({ session, bookingExpires: expirationTime });
        
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// Membuat booking baru
exports.createBooking = async (req, res) => {
    const connection = await db.getConnection();
    const sessionId = req.params.sessionId;
    const userId = req.session.user.id;

    try {
        // PERBAIKAN: Tambahkan grace period 2 detik di sini
        if (!req.session.bookingExpires || Date.now() > (req.session.bookingExpires + 2000)) {
            delete req.session.bookingExpires;
            throw new Error('Waktu konfirmasi Anda telah habis. Silakan coba lagi.');
        }

        const hasOverlap = await Booking.checkOverlap(userId, sessionId);
        if (hasOverlap) {
            throw new Error('Anda sudah memiliki reservasi lain pada waktu yang bersamaan.');
        }

        await connection.beginTransaction();

        const updatedRows = await Session.decrementPublicQuota(sessionId, connection);
        if (updatedRows === 0) {
            throw new Error('Kuota sudah habis atau sesi tidak ditemukan.');
        }

        const reservationCode = await Booking.create({ 
            session_id: sessionId, 
            user_id: userId 
        }, connection);

        await Notification.create({
            user_id: userId,
            message: `Reservasi Anda dengan kode ${reservationCode} telah berhasil dibuat.`,
            link: '/history'
        });

        await connection.commit();
        delete req.session.bookingExpires;
        
        return res.json({ success: true, code: reservationCode });

    } catch (error) {
        await connection.rollback();
        delete req.session.bookingExpires;
        console.error("Booking Gagal:", error.message);
        
        return res.status(400).json({ success: false, message: error.message });
        
    } finally {
        connection.release();
    }
};

// Menampilkan halaman profil
exports.showProfilePage = async (req, res) => {
    try {
        const user = await User.findById(req.session.user.id);
        res.render('profile', {
            title: 'Profil Saya',
            user,
            path: req.path
        });
    } catch (error) {
        console.error(error);
        res.status(500).send("Server Error");
    }
};

// Menampilkan halaman riwayat
exports.showHistoryPage = async (req, res) => {
    try {
        const bookings = await Booking.findByUserId(req.session.user.id);
        res.render('history', {
            title: 'Riwayat Reservasi',
            bookings,
            path: req.path
        });
    } catch (error) {
        console.error(error);
        res.status(500).send("Server Error");
    }
};