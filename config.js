// All settings come from environment variables (.env, see .env.example).
// Do not write real passwords in this file.
module.exports = {
  cookieSecret: process.env.COOKIE_SECRET || 'dev-secret',
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'expressApp',
    password: process.env.DB_PASSWORD || 'expressPassword',
    database: process.env.DB_NAME || 'projectflow',
    connectTimeout: 60000,
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4',
  },
};
