import connection from './config/dbConnection.js';
import express from 'express';
import cors from 'cors';

const ipAddress = '45.140.185.57';
const port = 3000;
const app = express();

app.use(cors());

// Define routes
app.get('/', (req, res) => {
    res.send('Hello World!');
});

// Start the server
app.listen(port, (err) => {
    if (err) {
        console.error('Error starting server:', err);
        return;
    }
    console.log(`Server running at http://${ipAddress}:${port}/`);
});

// Handle database connection error
connection.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL database:', err);
        process.exit(1); // Exit the application if database connection fails
    }
    console.log('Connected to MySQL database successfully!');
});

// Close database connection on application shutdown
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
