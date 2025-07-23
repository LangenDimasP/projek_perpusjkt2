const express = require('express');
const router = express.Router();
const picController = require('../controllers/picController');
const { isPic } = require('../middleware/authMiddleware');

// Semua rute di sini diproteksi untuk PIC
router.use(isPic);

// Show the PIC dashboard
router.get('/dashboard', picController.showDashboard);

// API endpoint to validate a user ID
router.post('/api/validate-user', picController.validateUser);

// NEW: Process the bulk allocation
router.post('/allocate-bulk', picController.allocateBulkBooking);

router.get('/history', picController.showAllocationHistory);

module.exports = router;