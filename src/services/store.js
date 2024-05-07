import fs from 'fs';

function loadDataFromFile(filename) {
    try {
        const data = fs.readFileSync(filename, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading data from file:', error);
        return null;
    }
}

function saveDataToFile(filename, data) {
    try {
        fs.writeFileSync(filename, JSON.stringify(data), 'utf8');
        console.log('Data saved to file:', filename);
    } catch (error) {
        console.error('Error saving data to file:', error);
    }
}

export { loadDataFromFile, saveDataToFile };
