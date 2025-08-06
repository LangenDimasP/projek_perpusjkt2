const bcrypt = require('bcrypt');
const db = require('../config/db');

class User {
    static async create(newUser) {
        // Hash password sebelum disimpan
        const hashedPassword = await bcrypt.hash(newUser.password, 10);
        
        const sql = 'INSERT INTO users (unique_user_id, name, email, password, role) VALUES (?, ?, ?, ?, ?)';
        
        await db.query(sql, [
            newUser.unique_user_id,
            newUser.name,
            newUser.email,
            hashedPassword, // Simpan password yang sudah di-hash
            newUser.role || 'USER'
        ]);
    }
    static async updatePassword(id, hashedPassword) {
        const sql = 'UPDATE users SET password = ? WHERE id = ?';
        await db.query(sql, [hashedPassword, id]);
    }

    static async findByEmail(email) {
        const sql = 'SELECT * FROM users WHERE email = ?';
        const [rows] = await db.query(sql, [email]);
        return rows[0];
    }

    static async findById(id) {
        const sql = 'SELECT id, unique_user_id, name, email, role, password FROM users WHERE id = ?';
        const [rows] = await db.query(sql, [id]);
        return rows[0];
    }
    static async findByUniqueId(uniqueId) {
        const sql = 'SELECT * FROM users WHERE unique_user_id = ?';
        const [rows] = await db.query(sql, [uniqueId]);
        return rows[0];
    }
}

module.exports = User;