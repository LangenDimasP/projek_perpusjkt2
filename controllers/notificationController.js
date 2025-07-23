const Notification = require('../models/Notification');

exports.showNotificationsPage = async (req, res) => {
    try {
        const userId = req.session.user.id;
        
        // Get filter values from URL query, set defaults if not provided
        const dateFilter = req.query.date || 'all'; // e.g., 'today', 'week', 'all'
        const typeFilter = req.query.type || 'all'; // e.g., 'booking', 'checkin', 'all'

        // Pass filter values to the model to get filtered notifications
        const notifications = await Notification.findByUserId(userId, { dateFilter, typeFilter });

        // Mark all as read (optional, you might want to change this logic with filters)
        // For now, we'll keep it simple and mark all as read when the page is visited.
        await Notification.markAllAsRead(userId);

        res.render('notifications', {
            title: 'Notifikasi',
            notifications,
            path: req.originalUrl,
            filters: { date: dateFilter, type: typeFilter } // Pass current filters to the view
        });
    } catch (error) {
        console.error(error);
        res.status(500).send("Server Error");
    }
};