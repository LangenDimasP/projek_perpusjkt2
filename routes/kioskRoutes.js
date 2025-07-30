const express = require('express');
const router = express.Router();
const kioskController = require('../controllers/kioskController');
const { isKiosk } = require('../middleware/authMiddleware');

router.use(isKiosk);

router.get('/dashboard', kioskController.showKioskDashboard);

router.get('/checkin', kioskController.showCheckinPage);
router.post('/checkin', kioskController.processCheckin);
router.get('/history', kioskController.showCheckinHistory);
router.get('/recap', kioskController.showCheckinRecap);

module.exports = router;