const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const dbPool = require('./config/db');
const Notification = require('./models/Notification');
const { startScheduledJobs } = require('./cron-jobs');
const methodOverride = require('method-override');

// Import all route files
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const picRoutes = require('./routes/picRoutes');
const kioskRoutes = require('./routes/kioskRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const indexRoutes = require('./routes/index');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware for parsing body and serving static files
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/dist', express.static(path.join(__dirname, 'dist')));
app.use(methodOverride('_method'));

// Setup Session Middleware (CRITICAL: Must be here)
const options = {
    schema: {
        tableName: 'user_sessions'
    }
};
const sessionStore = new MySQLStore(options, dbPool);
app.use(session({
    secret: process.env.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 // 1 day
    }
}));



// Global middleware for user and notification data in views
app.use(async (req, res, next) => {
    res.locals.user = req.session.user || null;
    if (req.session.user) {
        res.locals.unreadNotifications = await Notification.getUnreadCount(req.session.user.id);
    } else {
        res.locals.unreadNotifications = 0;
    }
    next();
});

// Setup View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// All specific routes first
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/pic', picRoutes);
app.use('/kiosk', kioskRoutes);
app.use('/notifications', notificationRoutes);

// The general homepage route is LAST
app.use('/', indexRoutes); 


// Start Server
app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
    startScheduledJobs();
})



