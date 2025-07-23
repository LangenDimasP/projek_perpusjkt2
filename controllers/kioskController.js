const Booking = require('../models/Booking');
const Notification = require('../models/Notification');

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