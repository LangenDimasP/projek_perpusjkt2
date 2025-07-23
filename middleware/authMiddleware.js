// Middleware untuk halaman web biasa, akan redirect ke halaman login
exports.isLoggedIn = (req, res, next) => {
    if (req.session.user) {
        return next();
    }
    res.redirect('/auth/login');
};

// Middleware BARU untuk rute API, akan mengirim error JSON
exports.isLoggedInApi = (req, res, next) => {
    if (req.session.user) {
        return next();
    }
    // Kirim respons error 401 (Unauthorized) dalam format JSON
    res.status(401).json({ success: false, message: 'Akses ditolak. Silakan login kembali.' });
};

// Middleware untuk memeriksa peran ADMIN
exports.isAdmin = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    if (req.session.user.role !== 'ADMIN') {
        return res.status(403).send('Akses ditolak. Anda bukan Admin.');
    }
    next();
};

// Middleware untuk memeriksa peran PIC
exports.isPic = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    if (req.session.user.role !== 'PIC') {
        return res.status(403).send('Akses ditolak. Anda bukan PIC.');
    }
    next();
};

// Middleware untuk memeriksa peran KIOSK
exports.isKiosk = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    if (req.session.user.role !== 'KIOSK') {
        return res.status(403).send('Akses ditolak. Anda bukan Petugas Kiosk.');
    }
    next();
};