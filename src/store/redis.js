import { redisClient } from '../..';

function storeStateData(key, stateData) {
    redisClient.exists(key, (err, exists) => {
        if (err) {
            console.error('Error checking if key exists in Redis:', err);
            return;
        }
        if (exists) {
            console.log(`Data already exists at key '${key}' in Redis. Skipping.`);
        } else {
            redisClient.set(key, JSON.stringify(stateData), (err) => {
                if (err) {
                    console.error('Error storing state data in Redis:', err);
                } else {
                    console.log('State data stored in Redis successfully');
                }
            });
        }
    });
}

function removeStateData(key) {
    redisClient.del(key, (err, response) => {
        if (err) {
            console.error('Error removing state data from Redis:', err);
        } else {
            if (response === 1) {
                console.log('State data removed from Redis successfully');
            } else {
                console.log('State data not found in Redis');
            }
        }
    });
}

function retrieveStateData(key, callback) {
    redisClient.get(key, (err, stateData) => {
        if (err) {
            console.error('Error retrieving state data from Redis:', err);
            callback(null);
        } else {
            console.log('State data retrieved from Redis successfully');
            callback(stateData);
        }
    });
}

function deserializeState(stateData) {
    try {
        return JSON.parse(stateData);
    } catch (error) {
        console.error('Error deserializing state data:', error);
        return null;
    }
}

function resumeProcesses(stateData) {
    console.log('Restored state data:', stateData);
}

export { storeStateData, retrieveStateData, deserializeState, resumeProcesses, removeStateData };
