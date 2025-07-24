const Session = require('../models/Session');
const User = require('../models/User');
const Booking = require('../models/Booking');
const db = require('../config/db');
const Notification = require('../models/Notification');

exports.showAllocatePage = async (req, res) => {
    try {
        const { filter, month, year } = req.query;
        const now = new Date();
        const defaultMonth = (now.getMonth() + 1).toString(); // bulan 1-12
        const defaultYear = now.getFullYear().toString();
        
        const filters = {
            eventFilter: filter ? filter.toLowerCase() : 'immersif',
            month: month ? month : defaultMonth,
            year: year ? year : defaultYear
        };

        const sessions = await Session.getForPic(filters);

        res.render('pic/allocate', {
            title: 'PIC Alokasi',
            path: req.originalUrl,
            sessions,
            currentFilter: filters.eventFilter,
            currentMonth: filters.month,
            currentYear: filters.year,
            error: req.query.error ? decodeURIComponent(req.query.error) : null,
            success: req.query.success
        });
    } catch (error) {
        console.error(error);
        res.status(500).send("Server Error");
    }
};

exports.showPicDashboard = async (req, res) => {
    try {
        const picId = req.session.user.id;

        // --- Data untuk Kartu Statistik ---
        const [totalAlloc] = await db.query("SELECT COUNT(id) as count FROM bookings WHERE booked_by_pic_id = ?", [picId]);
        const [totalPeople] = await db.query("SELECT SUM(group_size) as total FROM bookings WHERE booked_by_pic_id = ?", [picId]);
        const [activeSessions] = await db.query("SELECT COUNT(id) as count FROM sessions WHERE internal_quota > 0 AND internal_allocation_closed = false AND start_time >= NOW()");

        const stats = {
            totalAllocations: totalAlloc[0]?.count || 0,
            totalPeopleAllocated: totalPeople[0]?.total || 0,
            activeSessions: activeSessions[0]?.count || 0,
        };

        // --- Data untuk Chart ---
        // 1. Chart Alokasi per Event (Bar Chart)
        const [eventData] = await db.query("SELECT e.name, COUNT(b.id) as count FROM bookings b JOIN sessions s ON b.session_id = s.id JOIN events e ON s.event_id = e.id WHERE b.booked_by_pic_id = ? GROUP BY e.name ORDER BY count DESC LIMIT 5", [picId]);
        const eventLabels = eventData.map(row => row.name);
        const eventCounts = eventData.map(row => row.count);

        // 2. Chart Aktivitas Alokasi 7 Hari Terakhir (Line Chart)
        const [dailyData] = await db.query("SELECT DATE(created_at) as date, COUNT(id) as count FROM bookings WHERE booked_by_pic_id = ? AND created_at >= CURDATE() - INTERVAL 7 DAY GROUP BY DATE(created_at) ORDER BY date ASC", [picId]);
        const dailyLabels = dailyData.map(row => new Date(row.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }));
        const dailyCounts = dailyData.map(row => row.count);

        // 3. Chart Rombongan vs. Sendiri (Doughnut Chart)
        const [typeData] = await db.query("SELECT CASE WHEN group_size > 1 THEN 'Rombongan' ELSE 'Sendiri' END as type, COUNT(id) as count FROM bookings WHERE booked_by_pic_id = ? GROUP BY type", [picId]);
        const typeLabels = typeData.map(row => row.type);
        const typeCounts = typeData.map(row => row.count);

        res.render('pic/dashboard', {
            title: 'Dashboard PIC',
            path: req.originalUrl,
            stats,
            eventLabels: JSON.stringify(eventLabels),
            eventData: JSON.stringify(eventCounts),
            dailyLabels: JSON.stringify(dailyLabels),
            dailyData: JSON.stringify(dailyCounts),
            typeLabels: JSON.stringify(typeLabels),
            typeData: JSON.stringify(typeCounts),
        });

    } catch (error) {
        console.error("Error fetching PIC dashboard data:", error);
        res.render('pic/dashboard', {
            title: 'Dashboard PIC',
            path: req.originalUrl,
            stats: { totalAllocations: 0, totalPeopleAllocated: 0, activeSessions: 0 },
            eventLabels: '[]', eventData: '[]',
            dailyLabels: '[]', dailyData: '[]',
            typeLabels: '[]', typeData: '[]',
        });
    }
};

exports.allocateBooking = async (req, res) => {
    const { sessionId, uniqueUserId } = req.body;
    const picId = req.session.user.id;
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const targetUser = await User.findByUniqueId(uniqueUserId);
        if (!targetUser) {
            throw new Error(`User dengan ID unik "${uniqueUserId}" tidak ditemukan.`);
        }

        const updatedRows = await Session.decrementInternalQuota(sessionId);
        if (updatedRows === 0) {
            throw new Error('Kuota internal sudah habis atau sesi tidak valid.');
        }

        await Booking.create({
            session_id: sessionId,
            user_id: targetUser.id,
            booking_type: 'INTERNAL',
            booked_by_pic_id: picId
        });

        await connection.commit();
        res.redirect('/pic/dashboard');

    } catch (error) {
        await connection.rollback();
        console.error(error);
        // Nanti bisa dibuat halaman error yang lebih baik
        res.status(400).send(`Gagal mengalokasikan: ${error.message}`);
    } finally {
        connection.release();
    }
};
exports.validateUser = async (req, res) => {
    try {
        const { uniqueUserId } = req.body;
        const user = await User.findByUniqueId(uniqueUserId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User ID tidak ditemukan.' });
        }
        // You could add a check here to see if the user already has a booking
        res.json({ success: true, user: { id: user.id, name: user.name, unique_user_id: user.unique_user_id } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// NEW: Function to process multiple bookings at once
exports.allocateBulkBooking = async (req, res) => {
    const { sessionId, userIds } = req.body;
    const picId = req.session.user.id;
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        // Ensure userIds is an array
        const userIdArray = Array.isArray(userIds) ? userIds : [userIds];

        if (userIdArray.length === 0) {
            throw new Error('Tidak ada user yang dipilih untuk dialokasikan.');
        }

        // Get current internal quota
        const session = await Session.findById(sessionId);
        if (session.internal_quota < userIdArray.length) {
            throw new Error('Jumlah user melebihi sisa kuota internal.');
        }

        // Create bookings for each user
        for (const userId of userIdArray) {
            await Booking.create({
                session_id: sessionId,
                user_id: userId,
                booking_type: 'INTERNAL',
                booked_by_pic_id: picId
            }, connection);
        }
        
        // Decrement quota by the number of users added
        const sql = 'UPDATE sessions SET internal_quota = internal_quota - ? WHERE id = ?';
        await connection.query(sql, [userIdArray.length, sessionId]);

        await connection.commit();
        res.redirect('/pic/dashboard?success=true');
    } catch (error) {
        await connection.rollback();
        console.error("Bulk allocation failed:", error);
        res.redirect(`/pic/dashboard?error=${encodeURIComponent(error.message)}`);
    } finally {
        connection.release();
    }
};
exports.showAllocationHistory = async (req, res) => {
    try {
        const picId = req.session.user.id;
        const page = parseInt(req.query.page, 10) || 1;
        const filters = {
            query: req.query.query || '',
            type: req.query.type || 'all',
            date: req.query.date || '',
            page: page
        };

        const allocations = await Booking.findByPicIdPaginated(picId, filters);
        const totalItems = await Booking.countByPicId(picId, filters);
        const totalPages = Math.ceil(totalItems / 10);

        if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
            return res.render('pic/partials/history-table', { 
                allocations, 
                currentPage: page, 
                totalPages 
            });
        }
        
        res.render('pic/history', {
            title: 'Riwayat Alokasi',
            path: req.originalUrl,
            allocations,
            currentPage: page,
            totalPages,
            filters
        });
    } catch (error) {
        console.error("Failed to fetch PIC history:", error);
        res.status(500).send("Server Error");
    }
};
exports.allocateGroupBooking = async (req, res) => {
    const { sessionId, leaderUniqueId, additionalMembers } = req.body;
    const picId = req.session.user.id;
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const leader = await User.findByUniqueId(leaderUniqueId);
        if (!leader) {
            throw new Error(`Ketua rombongan dengan ID "${leaderUniqueId}" tidak ditemukan.`);
        }

        const groupSize = parseInt(additionalMembers, 10) + 1;
        if (isNaN(groupSize) || groupSize <= 0) {
            throw new Error('Jumlah anggota tidak valid.');
        }

        const session = await Session.findById(sessionId);
        if (session.internal_quota < groupSize) {
            throw new Error('Jumlah rombongan melebihi sisa kuota internal.');
        }

        // Kurangi kuota internal
        await Session.decrementInternalQuota(sessionId, groupSize, connection);

        // Buat booking dan tangkap kode reservasinya
        const reservationCode = await Booking.create({
            session_id: sessionId,
            user_id: leader.id,
            booking_type: 'INTERNAL',
            booked_by_pic_id: picId,
            group_size: groupSize
        }, connection);

        // --- TAMBAHAN: BUAT NOTIFIKASI UNTUK KETUA ROMBONGAN ---
        await Notification.create({
            user_id: leader.id,
            message: `Anda telah didaftarkan sebagai ketua rombongan (${groupSize} orang) untuk event "${session.event_name}".`,
            link: '/history'
        });
        // --- SELESAI ---

        await connection.commit();
        res.redirect('/pic/dashboard?success=true');

    } catch (error) {
        await connection.rollback();
        console.error("Group allocation failed:", error);
        res.redirect(`/pic/dashboard?error=${encodeURIComponent(error.message)}`);
    } finally {
        connection.release();
    }
};