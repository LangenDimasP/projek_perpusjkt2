const cron = require('node-cron');
const db = require('./config/db');

// Fungsi untuk memulai SEMUA pekerjaan terjadwal
const startScheduledJobs = () => {
    console.log('Scheduled jobs are now running...');

    // Jalankan tugas ini setiap menit ('* * * * *')
    cron.schedule('* * * * *', async () => {
        console.log(`[${new Date().toLocaleTimeString()}] Running scheduled jobs...`);
        
        try {
            // --- TUGAS 1: Update Status Sesi ---
            const updateStatuses = async () => {
                // 1. (BARU) Selesaikan semua sesi yang waktunya sudah lewat total.
                // Ini akan memperbaiki sesi yang "terjebak" di status UPCOMING atau OPEN.
                await db.query(`
                    UPDATE sessions SET status = 'FINISHED'
                    WHERE status IN ('UPCOMING', 'OPEN', 'CLOSED') AND NOW() >= end_time;
                `);

                // 2. Tutup sesi yang sedang berlangsung (dari OPEN -> CLOSED)
                await db.query(`
                    UPDATE sessions SET status = 'CLOSED'
                    WHERE status = 'OPEN' AND NOW() >= start_time AND NOW() < end_time;
                `);

                // 3. Buka sesi yang waktunya sudah tiba (dari UPCOMING -> OPEN)
                await db.query(`
                    UPDATE sessions SET status = 'OPEN'
                    WHERE status = 'UPCOMING' AND NOW() >= booking_open_time AND NOW() < start_time;
                `);
                
                // 4. Tandai sesi sebagai PENUH jika kuota habis
                await db.query(`
                    UPDATE sessions SET status = 'FULL'
                    WHERE status = 'OPEN' AND (public_quota + internal_quota) = 0;
                `);
            };

            // --- TUGAS 2: Pindahkan Kuota Internal yang akan Kedaluwarsa ---
            const moveInternalQuotas = async () => {
                const [result] = await db.query(`
                    UPDATE sessions
                    SET
                        public_quota = public_quota + internal_quota,
                        internal_quota = 0,
                        internal_allocation_closed = true
                    WHERE
                        start_time BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 10 MINUTE)
                        AND internal_quota > 0;
                `);
                if (result.affectedRows > 0) {
                    console.log(`Successfully moved internal quota for ${result.affectedRows} session(s).`);
                }
            };

            // Jalankan kedua tugas
            await updateStatuses();
            await moveInternalQuotas();

        } catch (error) {
            console.error('Error running scheduled jobs:', error);
        }
    });
};

module.exports = { startScheduledJobs };