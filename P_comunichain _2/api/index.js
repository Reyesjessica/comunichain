const db = require('../src/database');
const app = require('../index');

let initialized = false;

module.exports = async (req, res) => {
  if (!initialized) {
    try {
      await db.initialize();
      initialized = true;
    } catch (err) {
      console.error('DB init error:', err.message);
    }
  }
  app(req, res);
};
