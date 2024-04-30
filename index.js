import startSMPPServer, { addBindCredentials } from './src/services/smppServer.js';
import connection from './config/dbConnection.js';
import smsRouter from './src/routes/smsRoutes.js';
import bodyParser from 'body-parser';
import express from 'express';
import cors from 'cors';
import http from 'http';

const ipAddress = process.env.NODE_HOST;
const port = process.env.NODE_PORT;
const app = express();

app.use(cors());
app.use(bodyParser.json({ limit: '20mb' }));
app.use('/sms', smsRouter);

const server = http.createServer(app);

server.listen(port, ipAddress, (err) => {
    if (err) {
        console.error('Error starting HTTP server:', err);
        return;
    }
    console.log(`HTTP Server running at http://${ipAddress}:${port}/`);
    startSMPPServer();
});

connection.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL database:', err);
        process.exit(1);
    }
    console.log('Connected to MySQL database successfully!');
});

process.on('SIGINT', () => {
    connection.end((err) => {
        if (err) {
            console.error('Error closing MySQL connection:', err);
            process.exit(1);
        }
        console.log('MySQL connection closed successfully!');
        process.exit(0);
    });
});
