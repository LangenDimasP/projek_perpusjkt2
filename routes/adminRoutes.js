const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { isAdmin } = require('../middleware/authMiddleware');
const Session = require('../models/Session');
const { getAllSessions, getSessionById, updateSession, deleteSession } = require('../controllers/scheduleController');

// Middleware untuk memastikan hanya admin yang bisa mengakses
router.use(isAdmin);

// --- ROUTES UNTUK ADMIN ---

// Dashboard utama
router.get('/dashboard', adminController.showDashboard);

// Halaman untuk melihat semua sesi yang dijadwalkan
router.get('/schedules', adminController.showSchedulesPage);

// Halaman untuk membuat event atau sesi baru
router.get('/create', adminController.showCreatePage);

// Route untuk membuat event baru
router.post('/events', adminController.createEvent);

// Route untuk membuat sesi baru
router.post('/sessions', adminController.createSession);

router.get('/schedules', async (req, res) => {
    const events = await getAllEvents(); // Pastikan fungsi ini ada di controller
    console.log('Events:', events); // Debug data
    res.render('admin/schedules', { 
        events,
        title: 'Daftar Sesi Terjadwal',
        path: req.originalUrl
    });
});

// --- ROUTES UNTUK MANAGE SCHEDULE ---

// Halaman untuk mengelola semua sesi (manage schedule)
router.get('/manage-schedule', async (req, res) => {
    const sessions = await getAllSessions();
    res.render('admin/manage-schedule', { 
        sessions,
        title: 'Manage Schedule',
        path: req.originalUrl
    });
});

router.get('/session/:id', async (req, res) => {
    const sessionId = req.params.id;
    console.log('Session ID:', sessionId); // Debug ID
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
});

// Route untuk mengupdate sesi berdasarkan ID
router.put('/manage-schedule/:id', async (req, res) => {
    await updateSession(req.params.id, req.body);
    res.redirect('/admin/manage-schedule');
});

// Route untuk menghapus sesi berdasarkan ID
router.delete('/manage-schedule/:id', async (req, res) => {
    await deleteSession(req.params.id);
    res.redirect('/admin/manage-schedule');
});

module.exports = router;