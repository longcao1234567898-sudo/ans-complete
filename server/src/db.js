/**
 * Kết nối MySQL bằng connection pool (mysql2/promise).
 * Hỗ trợ SSL cho MySQL cloud (Aiven...) qua biến DB_SSL_CA hoặc DB_SSL.
 */
import fs from 'node:fs';
import mysql from 'mysql2/promise';
import 'dotenv/config';

function buildSsl() {
  if (process.env.DB_SSL_CA) return { ca: fs.readFileSync(process.env.DB_SSL_CA) };
  if (process.env.DB_SSL === 'true') return { rejectUnauthorized: false };
  return undefined;
}

export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'hop_thu_an_ninh_so',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4_unicode_ci',
  ssl: buildSsl(),
});
