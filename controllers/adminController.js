const Event = require('../models/Event');
const Session = require('../models/Session');
const db = require('../config/db');

// Menampilkan dasbor utama admin dengan statistik dan chart
exports.showDashboard = async (req, res) => {
    try {
        // Data for Stat Cards
        const [totalBookings] = await db.query("SELECT COUNT(id) as count FROM bookings WHERE status = 'CONFIRMED'");
        const [newUsers] = await db.query("SELECT COUNT(id) as count FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)");
        const [avgBookings] = await db.query("SELECT AVG(daily_count) as avg FROM (SELECT COUNT(id) as daily_count FROM bookings GROUP BY DATE(created_at)) as daily_counts");
        const [busiestDay] = await db.query("SELECT DATE_FORMAT(date, '%W') as day FROM (SELECT DATE(created_at) as date, COUNT(id) as count FROM bookings GROUP BY DATE(created_at) ORDER BY count DESC LIMIT 1) as busiest");
        
        const stats = {
            totalBookings: totalBookings[0]?.count || 0,
            newUsers: newUsers[0]?.count || 0,
            avgBookings: parseFloat(avgBookings[0]?.avg || 0).toFixed(1),
            busiestDay: busiestDay.length > 0 ? busiestDay[0].day : 'N/A'
        };

        // Data for Charts
        const [dailyData] = await db.query("SELECT DATE(created_at) as date, COUNT(id) as count FROM bookings WHERE created_at >= CURDATE() - INTERVAL 7 DAY GROUP BY DATE(created_at) ORDER BY date ASC");
        const dailyLabels = dailyData.map(row => new Date(row.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }));
        const dailyCounts = dailyData.map(row => row.count);

        const [typeData] = await db.query("SELECT booking_type, COUNT(id) as count FROM bookings GROUP BY booking_type");
        const typeLabels = typeData.map(row => row.booking_type);
        const typeCounts = typeData.map(row => row.count);

        const [popularData] = await db.query("SELECT e.name, COUNT(b.id) as count FROM bookings b JOIN sessions s ON b.session_id = s.id JOIN events e ON s.event_id = e.id GROUP BY e.name ORDER BY count DESC LIMIT 5");
        const popularLabels = popularData.map(row => row.name);
        const popularCounts = popularData.map(row => row.count);

        res.render('admin/dashboard', { 
            title: 'Admin Dashboard',
            path: req.originalUrl,
            stats,
            dailyLabels: JSON.stringify(dailyLabels),
            dailyData: JSON.stringify(dailyCounts),
            typeLabels: JSON.stringify(typeLabels),
            typeData: JSON.stringify(typeCounts),
            popularLabels: JSON.stringify(popularLabels),
            popularData: JSON.stringify(popularCounts)
        });
    } catch (error) {
        console.error("Error fetching dashboard data:", error);
        res.render('admin/dashboard', { 
            title: 'Admin Dashboard',
            path: req.originalUrl,
            stats: { totalBookings: 0, newUsers: 0, avgBookings: 0, busiestDay: 'N/A' },
            dailyLabels: '[]', dailyData: '[]',
            typeLabels: '[]', typeData: '[]',
            popularLabels: '[]', popularData: '[]'
        });
    }
};

// Menampilkan halaman daftar semua sesi terjadwal
exports.showSchedulesPage = async (req, res) => {
    try {
        const results = await Event.getWithSessions();
        const events = {};
        
        results.forEach(row => {
            if (!events[row.event_id]) {
                events[row.event_id] = { 
                    id: row.event_id, 
                    name: row.event_name, 
                    sessions: [] 
                };
            }
            if (row.session_id) {
                events[row.event_id].sessions.push(row);
            }
        });
        const eventsArray = Object.values(events);

        res.render('admin/schedules', { 
            title: 'Daftar Sesi Terjadwal',
            events: eventsArray,
            path: req.originalUrl
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Terjadi kesalahan pada server');
    }
};

// Menampilkan halaman untuk membuat event & sesi baru
exports.showCreatePage = async (req, res) => {
    try {
        const events = await Event.getAll();
        res.render('admin/create-schedule', {
            title: 'Buat Jadwal Baru',
            events,
            path: req.originalUrl,
            error: req.query.error ? decodeURIComponent(req.query.error) : null
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Terjadi kesalahan pada server');
    }
};

// Memproses pembuatan event baru
exports.createEvent = async (req, res) => {
    try {
        await Event.create(req.body);
        res.redirect('/admin/create');
    } catch (error) {
        console.error(error);
        res.redirect('/admin/create');
    }
};

// Memproses pembuatan sesi baru
exports.createSession = async (req, res) => {
    try {
        const {
            event_id, start_time, end_time, booking_open_time,
            total_quota, public_quota, include_internal, internal_quota
        } = req.body;

        if (!start_time || !end_time || !booking_open_time) {
            throw new Error("Semua input waktu (mulai, selesai, dan buka) wajib diisi.");
        }

        const sessionData = {
            event_id: parseInt(event_id),
            start_time: start_time,
            end_time: end_time,
            booking_open_time: booking_open_time,
            total_quota: parseInt(total_quota),
            public_quota: parseInt(public_quota),
            internal_quota: include_internal ? parseInt(internal_quota) : 0,
        };

        const overlapCount = await Session.checkTimeOverlap(
            sessionData.event_id,
            sessionData.start_time,
            sessionData.end_time
        );

        if (overlapCount > 0) {
            throw new Error('Jadwal sesi tumpang tindih dengan sesi yang sudah ada di event ini.');
        }

        if (sessionData.public_quota + sessionData.internal_quota > sessionData.total_quota) {
            throw new Error("Jumlah kuota publik dan internal tidak boleh melebihi total kuota.");
        }

        await Session.create(sessionData);
        res.redirect('/admin/schedules?success=session_added');

    } catch (error) {
        console.error(error);
        const errorMessage = encodeURIComponent(error.message);
        res.redirect(`/admin/create?error=${errorMessage}`);
    }
};

// Menampilkan detail pengunjung untuk satu sesi
exports.showSessionDetails = async (req, res) => {
    try {
        const sessionId = req.params.id;
        const session = await Session.findById(sessionId);
        const attendees = await Session.getAttendeesById(sessionId);

        if (!session) {
            return res.status(404).send('Sesi tidak ditemukan.');
        }

        res.render('admin/session-details', {
            title: `Detail Sesi`,
            session,
            attendees,
            path: req.originalUrl
        });
    } catch (error) {
        console.error(error);
        res.status(500).send("Server Error");
    }
};