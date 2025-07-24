const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { isAdmin } = require('../middleware/authMiddleware');

// Middleware untuk memastikan hanya admin yang bisa mengakses
router.use(isAdmin);

// --- RUTE-RUTE UTAMA ADMIN ---

// Dashboard utama
router.get('/dashboard', adminController.showDashboard);

// Halaman untuk melihat semua sesi yang dijadwalkalo
router.get('/schedules', adminController.showSchedulesPage);

// Halaman untuk membuat event atau sesi baru
router.get('/create', adminController.showCreatePage);

// Halaman untuk melihat detail pengunjung sebuah sesi
router.get('/session/:id', adminController.showSessionDetails);

// --- RUTE UNTUK MEMPROSES FORM ---

// Memproses pembuatan event baru
router.post('/events', adminController.createEvent);

// Memproses pembuatan sesi baru
router.post('/sessions', adminController.createSession);

// Main page to manage all events and sessions
router.get('/manage', adminController.showManagePage);

// Show edit form for an Event
router.get('/event/:id/edit', adminController.showEventEditPage);
// Process event update
router.post('/event/:id/edit', adminController.updateEvent);
// Process event delete
router.post('/event/:id/delete', adminController.deleteEvent);

// Show edit form for a Session
router.get('/session/:id/edit', adminController.showSessionEditPage);
// Process session update
router.post('/session/:id/edit', adminController.updateSession);
// Process session delete
router.post('/session/:id/delete', adminController.deleteSession);

module.exports = router;