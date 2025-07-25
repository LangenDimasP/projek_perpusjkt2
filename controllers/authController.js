const bcrypt = require('bcrypt');
const User = require('../models/User');

// Menampilkan halaman register dengan pesan error jika ada
exports.showRegisterPage = (req, res) => {
    const { error } = req.query;
    res.render('auth/register', { 
        title: 'Register',
        path: req.originalUrl,
        error
    });
};

// Memproses registrasi user baru
exports.registerUser = async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const existingUser = await User.findByEmail(email);

        if (existingUser) {
            return res.redirect('/auth/register?error=email_exists');
        }

        const newUser = {
            unique_user_id: `USR-${Date.now()}`,
            name,
            email,
            password
        };

        await User.create(newUser);
        // Redirect ke halaman login dengan pesan sukses
        res.redirect('/auth/login?status=register_success');

    } catch (error) {
        console.error(error);
        res.redirect('/auth/register?error=server_error');
    }
};

// Menampilkan halaman login dengan pesan sukses/error
exports.showLoginPage = (req, res) => {
    const { error, status, email } = req.query;
    res.render('auth/login', { 
        title: 'Login',
        path: req.originalUrl,
        error,
        status,
        email: email || '' // Kirim email kembali jika ada
    });
};

// Memproses login
exports.loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findByEmail(email);

        // Jika email tidak ditemukan
        if (!user) {
            return res.redirect('/auth/login?error=email_not_found');
        }

        const isMatch = await bcrypt.compare(password, user.password);

        // Jika password salah
        if (!isMatch) {
            const encodedEmail = encodeURIComponent(email);
            return res.redirect(`/auth/login?error=password_incorrect&email=${encodedEmail}`);
        }
        
        req.session.user = {
            id: user.id,
            name: user.name,
            role: user.role
        };

        // Arahkan ke dasbor yang sesuai setelah login
        switch (user.role) {
            case 'ADMIN':
                res.redirect('/admin/dashboard');
                break;
            case 'PIC':
                res.redirect('/pic/dashboard');
                break;
            case 'KIOSK':
                res.redirect('/kiosk/dashboard');
                break;
            default:
                res.redirect('/dashboard');
        }

    } catch (error) {
        console.error(error);
        res.redirect('/auth/login?error=server_error');
    }
};

// Proses logout
exports.logoutUser = (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return console.error(err);
        }
        res.redirect('/auth/login');
    });
};
