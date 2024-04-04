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
        console.error(err)
        return
    }
    console.log(`Server running at http://${IP_ADDRESS}:${port}/`);
});
