const express = require('express');
const router = express.Router();
const publicController = require('../controllers/publicController');
const { isLoggedIn, isLoggedInApi } = require('../middleware/authMiddleware');

// Route for the homepage
router.get('/', publicController.showHomePage);

// API route to get session details for the modal (THIS IS THE MISSING/INCORRECT LINE)
router.get('/api/session/:id', isLoggedInApi, publicController.getSessionDetails);

// Route to process a new booking (protected)
router.post('/booking/:sessionId', isLoggedInApi, publicController.createBooking);
// Pastikan isLoggedInApi dari authMiddleware

// Route for the user profile page (protected)
router.get('/profile', isLoggedIn, publicController.showProfilePage);

// Route for the booking history page (protected)
router.get('/history', isLoggedIn, publicController.showHistoryPage);

router.get('/dashboard', isLoggedIn, publicController.showUserDashboard);

module.exports = router;