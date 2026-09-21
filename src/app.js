const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const apiRoutes = require('./presentation/routes/api.routes');
const errorHandler = require('./presentation/middlewares/error-handler');

const app = express();

app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

app.use('/api', apiRoutes);
app.use(express.static(path.join(__dirname, '../public')));

app.use(errorHandler);

module.exports = app;
