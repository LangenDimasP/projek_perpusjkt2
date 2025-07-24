const express = require('express');
const router = express.Router();
const picController = require('../controllers/picController');
const { isPic } = require('../middleware/authMiddleware');

// Semua rute di sini diproteksi untuk PIC
router.use(isPic);

// RUTE BARU: Halaman dasbor statistik PIC
router.get('/dashboard', picController.showPicDashboard);

// RUTE LAMA (diganti nama): Halaman untuk melakukan alokasi
router.get('/allocate', picController.showAllocatePage);

// Rute lainnya tetap sama
router.get('/history', picController.showAllocationHistory);
router.post('/api/validate-user', picController.validateUser);
router.post('/allocate-group', picController.allocateGroupBooking);

module.exports = router;