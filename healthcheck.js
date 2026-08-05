// Container HEALTHCHECK: GET /api/health, exit non-zero on non-200 (architecture §7.1).
const port = process.env.PORT || 8080;
const req = require('node:http').get(
  { host: '127.0.0.1', port, path: '/api/health', timeout: 2500 },
  (res) => {
    process.exit(res.statusCode === 200 ? 0 : 1);
  },
);
req.on('error', () => process.exit(1));
req.on('timeout', () => {
  req.destroy();
  process.exit(1);
});
