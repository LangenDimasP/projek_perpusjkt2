const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Menampilkan form
router.get('/register', authController.showRegisterPage);
router.get('/login', authController.showLoginPage);

// Memproses data form
router.post('/register', authController.registerUser);
router.post('/login', authController.loginUser);

// Logout
router.get('/logout', authController.logoutUser);

module.exports = router;