const { Pool } = require('pg');

// This pool connects ONLY to the Digital Card project's own database,
// defined by DATABASE_URL in this project's .env file.
// It must never point at the existing CafeMenu production database.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('[db] Unexpected error on idle client', err);
});

module.exports = { pool };
