const cron = require('node-cron');
const db = require('./config/db');

// Fungsi untuk memulai pekerjaan terjadwal
const startInternalQuotaJob = () => {
    // Jalankan tugas ini setiap menit ('* * * * *')
    cron.schedule('* * * * *', async () => {
        console.log('Running a job every minute to check for expiring internal quotas...');
        
        try {
            const sql = `
                UPDATE sessions
                SET
                    public_quota = public_quota + internal_quota,
                    internal_quota = 0,
                    internal_allocation_closed = true
                WHERE
                    -- Sesi akan dimulai dalam 10 menit dari sekarang
                    start_time BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 10 MINUTE)
                    -- Dan masih ada kuota internal yang tersisa
                    AND internal_quota > 0;
            `;

            const [result] = await db.query(sql);

            if (result.affectedRows > 0) {
                console.log(`Successfully moved internal quota to public for ${result.affectedRows} session(s).`);
            }

        } catch (error) {
            console.error('Error running internal quota job:', error);
        }
    });
};

module.exports = { startInternalQuotaJob };