const bcrypt = require('bcrypt');
const User = require('../models/User');

exports.showProfile = async (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');
    const user = await User.findById(req.session.user.id);
    res.render('profile', { 
        title: 'Profil Saya',
        path: req.originalUrl, // <-- Tambahkan ini
        user 
    });
};

exports.changePassword = async (req, res) => {
    try {
        const { oldPassword, newPassword, confirmPassword } = req.body;
        const userId = req.session.user.id;
        const user = await User.findById(userId);

        if (!user) {
            return res.render('profile', { title: 'Profil Saya', path: req.originalUrl, user, passwordError: 'User tidak ditemukan.' });
        }

        const isMatch = await bcrypt.compare(oldPassword, user.password);
        if (!isMatch) {
            return res.render('profile', { title: 'Profil Saya', path: req.originalUrl, user, passwordError: 'Password lama salah.' });
        }

        if (newPassword !== confirmPassword) {
            return res.render('profile', { title: 'Profil Saya', path: req.originalUrl, user, passwordError: 'Konfirmasi password tidak cocok.' });
        }

        if (newPassword.length < 6) {
            return res.render('profile', { title: 'Profil Saya', path: req.originalUrl, user, passwordError: 'Password baru minimal 6 karakter.' });
        }

        const hashed = await bcrypt.hash(newPassword, 10);
        await User.updatePassword(userId, hashed);

        res.render('profile', { title: 'Profil Saya', path: req.originalUrl, user, passwordSuccess: 'Password berhasil diganti.' });
    } catch (error) {
        console.error(error);
        res.render('profile', { title: 'Profil Saya', path: req.originalUrl, user: req.session.user, passwordError: 'Terjadi kesalahan server.' });
    }
};