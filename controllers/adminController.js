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
        const page = parseInt(req.query.page, 10) || 1;
        const filters = {
            query: req.query.query || '',
            eventId: req.query.eventId || 'all',
            date: req.query.date || '',
            page // <-- tambahkan ini!
        };
        
        const sessions = await Session.getPaginated(filters);
        const totalItems = await Session.countAll(filters);
        const totalPages = Math.ceil(totalItems / 8);
        const events = await Event.getAll();

        if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
            return res.render('admin/partials/schedules-table', { sessions, events, currentPage: page, totalPages });
        }
        
        res.render('admin/schedules', {
            title: 'Daftar Sesi Terjadwal',
            path: req.originalUrl,
            sessions,
            events,
            currentPage: page,
            totalPages,
            filters
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
        // Ambil pesan sukses dari query jika ada, agar hanya muncul setelah redirect
        const success = req.query.success ? decodeURIComponent(req.query.success) : null;
        const error = req.query.error ? decodeURIComponent(req.query.error) : null;

        res.render('admin/create-schedule', {
            title: 'Buat Jadwal Baru',
            events,
            path: req.originalUrl,
            success,
            error
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
        res.redirect('/admin/create?success=' + encodeURIComponent('Event berhasil dibuat'));
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
        // Redirect ke halaman create dengan pesan sukses
        res.redirect('/admin/create?success=' + encodeURIComponent('Sesi berhasil ditambahkan!'));

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
        const page = parseInt(req.query.page, 10) || 1;
        
        const session = await Session.findById(sessionId);
        if (!session) {
            return res.status(404).send('Sesi tidak ditemukan.');
        }

        // Ambil data pengunjung untuk halaman saat ini
        const attendees = await Session.getAttendeesByIdPaginated(sessionId, page);
        // Ambil total data pengunjung untuk menghitung total halaman
        const totalItems = await Session.countAttendeesById(sessionId);
        const totalPages = Math.ceil(totalItems / 10);

        res.render('admin/session-details', {
            title: `Detail Sesi`,
            path: req.originalUrl,
            session,
            attendees,
            currentPage: page,
            totalPages // <-- Pastikan variabel ini dikirim ke view
        });
    } catch (error) {
        console.error(error);
        res.status(500).send("Server Error");
    }
};
exports.showSessionEditPage = async (req, res) => {
    try {
        const session = await Session.findById(req.params.id);
        const events = await Event.getAll(); // For the dropdown
        if (!session) {
            return res.status(404).send('Sesi tidak ditemukan.');
        }
        res.render('admin/edit-session', {
            title: 'Edit Sesi',
            path: req.originalUrl,
            session,
            events
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

exports.showManagePage = async (req, res) => {
    try {
        const results = await Event.getWithSessions();
        const eventsMap = new Map();
        results.forEach(row => {
            if (!eventsMap.has(row.event_id)) {
                eventsMap.set(row.event_id, {
                    id: row.event_id,
                    name: row.event_name,
                    sessions: []
                });
            }
            if (row.session_id) {
                eventsMap.get(row.event_id).sessions.push(row);
            }
        });
        const eventsArray = Array.from(eventsMap.values());
        const success = req.query.success ? decodeURIComponent(req.query.success) : null;

        res.render('admin/manage', {
            title: 'Kelola Jadwal',
            path: req.originalUrl,
            events: eventsArray,
            success
        });
    } catch (error) {
        console.error("Error fetching management page data:", error);
        res.status(500).send("Server Error");
    }
};

// Menampilkan halaman form untuk mengedit event
exports.showEventEditPage = async (req, res) => {
    try {
        const event = await Event.findById(req.params.id);
        if (!event) {
            return res.status(404).send('Event tidak ditemukan.');
        }
        const success = req.query.success ? decodeURIComponent(req.query.success) : null;
        res.render('admin/edit-event', { 
            title: 'Edit Event', 
            path: req.originalUrl, 
            event,
            success
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

// Memproses update event
exports.updateEvent = async (req, res) => {
    try {
        await Event.update(req.params.id, req.body);
        res.redirect(`/admin/event/${req.params.id}/edit?success=${encodeURIComponent('Event berhasil diperbarui!')}`);
    } catch (error) {
        console.error(error);
        res.redirect(`/admin/event/${req.params.id}/edit`);
    }
};

// Memproses hapus event
exports.deleteEvent = async (req, res) => {
    try {
        await Event.delete(req.params.id);
        res.redirect('/admin/manage?success=' + encodeURIComponent('Event berhasil dihapus!'));
    } catch (error) {
        console.error(error);
        res.redirect('/admin/manage');
    }
};

// Menampilkan halaman form untuk mengedit sesi
exports.showSessionEditPage = async (req, res) => {
    try {
        const session = await Session.findById(req.params.id);
        const events = await Event.getAll();
        if (!session) {
            return res.status(404).send('Sesi tidak ditemukan.');
        }
        res.render('admin/edit-session', {
            title: 'Edit Sesi',
            path: req.originalUrl,
            session,
            events,
            error: req.query.error ? decodeURIComponent(req.query.error) : null
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

// Memproses update sesi (DIPERBARUI)
exports.updateSession = async (req, res) => {
    const sessionId = req.params.id;
    try {
        // Ambil data sesi dari database
        const session = await Session.findById(sessionId);
        if (!session) {
            return res.redirect(`/admin/session/${sessionId}/edit?error=Sesi tidak ditemukan.`);
        }

        // Cek apakah waktu sekarang sudah lewat jam mulai sesi
        const now = new Date();
        const sessionStart = new Date(session.start_time);
        if (now > sessionStart) {
            return res.redirect(`/admin/session/${sessionId}/edit?error=Anda tidak bisa mengedit sesi yang sudah dimulai atau lewat waktu mulai.`);
        }

        const public_quota = parseInt(req.body.public_quota) || 0;
        const internal_quota = req.body.include_internal ? (parseInt(req.body.internal_quota) || 0) : 0;
        const total_quota = public_quota + internal_quota;

        const sessionData = {
            event_id: parseInt(req.body.event_id),
            start_time: req.body.start_time,
            end_time: req.body.end_time,
            booking_open_time: req.body.booking_open_time,
            public_quota: public_quota,
            internal_quota: internal_quota,
            total_quota: total_quota,
        };

        await Session.update(sessionId, sessionData);
        res.redirect('/admin/manage?success=' + encodeURIComponent('Sesi berhasil diperbarui!'));
    } catch (error) {
        console.error(error);
        const errorMessage = encodeURIComponent(error.message);
        res.redirect(`/admin/session/${sessionId}/edit?error=${errorMessage}`);
    }
};

// Memproses hapus sesi
exports.deleteSession = async (req, res) => {
    try {
        const sessionId = req.params.id;
        await Session.delete(sessionId);
        res.redirect('/admin/manage?success=' + encodeURIComponent('Sesi berhasil dihapus!'));
    } catch (error) {
        console.error(error);
        res.redirect('/admin/manage');
    }
};