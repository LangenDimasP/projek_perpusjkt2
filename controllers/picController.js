const Session = require('../models/Session');
const User = require('../models/User');
const Booking = require('../models/Booking');
const db = require('../config/db');

exports.showDashboard = async (req, res) => {
    try {
        const sessions = await Session.getForPic();
        res.render('pic/dashboard', {
            title: 'PIC Dashboard',
            sessions,
            path: req.originalUrl
        });
    } catch (error) {
        console.error(error);
        res.status(500).send("Server Error");
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
        const allocations = await Booking.findByPicId(picId);
        res.render('pic/history', {
            title: 'Riwayat Alokasi',
            path: req.originalUrl,
            allocations
        });
    } catch (error) {
        console.error("Failed to fetch PIC history:", error);
        res.status(500).send("Server Error");
    }
};