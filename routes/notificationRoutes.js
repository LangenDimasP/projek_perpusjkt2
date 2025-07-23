const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { isLoggedIn } = require('../middleware/authMiddleware');

router.get('/', isLoggedIn, notificationController.showNotificationsPage);

module.exports = router;