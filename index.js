import connection from './config/dbConnection.js';
import express from 'express';
import cors from 'cors';

const IP_ADDRESS = '34.89.33.119';
const app = express();
const port = 3000;

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
    console.log(`Server running at http://${IP_ADDRESS}:${port}/`);
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
