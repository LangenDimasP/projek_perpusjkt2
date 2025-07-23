const bcrypt = require('bcrypt');
const User = require('../models/User');

// Menampilkan halaman register
exports.showRegisterPage = (req, res) => {
    res.render('auth/register', { title: 'Register', path: req.originalUrl });
};

// Memproses registrasi user baru
exports.registerUser = async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const existingUser = await User.findByEmail(email);

        if (existingUser) {
            // Sebaiknya ada flash message di sini, untuk sekarang kita redirect saja
            console.log('Email sudah terdaftar');
            return res.redirect('/auth/register');
        }

        const newUser = {
            unique_user_id: `USR-${Date.now()}`, // ID unik sederhana
            name,
            email,
            password
        };

        await User.create(newUser);
        res.redirect('/auth/login');

    } catch (error) {
        console.error(error);
        res.redirect('/auth/register');
    }
};

// Menampilkan halaman login
exports.showLoginPage = (req, res) => {
    res.render('auth/login', { title: 'Login', path: req.originalUrl });
};

// Memproses login
exports.loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findByEmail(email);

        if (!user) {
            console.log('Email tidak ditemukan');
            return res.redirect('/auth/login');
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            console.log('Password salah');
            return res.redirect('/auth/login');
        }
        
        // Simpan data user ke session
        req.session.user = {
            id: user.id,
            name: user.name,
            role: user.role
        };

        // Redirect ke dashboard (nanti dibuat) atau halaman utama
        res.redirect('/');

    } catch (error) {
        console.error(error);
        res.redirect('/auth/login');
    }
};

// Proses logout
exports.logoutUser = (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return console.error(err);
        }
        res.redirect('/');
    });
};