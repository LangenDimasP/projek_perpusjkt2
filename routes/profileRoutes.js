const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');

// Halaman profil
router.get('/', profileController.showProfile);

// Proses ganti password
router.post('/change-password', profileController.changePassword);

module.exports = router;