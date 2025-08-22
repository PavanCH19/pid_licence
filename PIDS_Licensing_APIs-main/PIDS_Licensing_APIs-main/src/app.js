const serverless = require('serverless-http');
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const compression = require('compression');
//const { initializeSecrets } = require('./Connectors/AwsSecretsManagerConnector.js');

dotenv.config();

const app = express();

// Initialize secrets on startup
// initializeSecrets().then(result => {
//   if (result.success) {
//     console.log('Secrets Manager initialized successfully');
//   } else {
//     console.error('Failed to initialize Secrets Manager:', result.message);
//   }
// }).catch(error => {
//   console.error('Error during secrets initialization:', error);
// });

app.use(cors()); // or configure per your needs
app.use(express.json());
app.use(compression());

// Import route modules
const customerRoutes = require('./Routes/customers');
const authRoutes = require('./Routes/auth');
// const adminRoutes = require('./Routes/admin');

// Unified API base
app.use('/api', authRoutes);      // All auth routes (public + authenticated)
app.use('/api', customerRoutes);  // Customer/license routes
//app.use('/api/admin', adminRoutes); // Admin routes (requires admin role)

app.get('/', (req, res) => res.send('API is running'));

module.exports.handler = serverless(app);

// Optional for local dev only
if (require.main === module) {
  const port = process.env.PORT || 4000;
  app.listen(port, () => console.log(`API server listening on http://localhost:${port}`));
}