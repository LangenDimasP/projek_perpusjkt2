const express = require('express');
const router = express.Router();
const kioskController = require('../controllers/kioskController');
const { isKiosk } = require('../middleware/authMiddleware');

router.use(isKiosk);

router.get('/checkin', kioskController.showCheckinPage);
router.post('/checkin', kioskController.processCheckin);
router.get('/history', kioskController.showCheckinHistory);

module.exports = router;