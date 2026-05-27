const db = require('../src/database');
const app = require('../index');

db.initialize().catch(err => console.error('DB init error:', err.message));

module.exports = app;
