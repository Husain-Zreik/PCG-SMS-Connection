import smpp from 'smpp';
import connection from '../../config/dbConnection.js';
import { addBindCredentials, closeAllSessions, selectCustomerCredentials } from '../services/smppServer.js';

function updateStatus(sentToId, status, serverMessageId) {
    const updateQuery = `UPDATE sent_to SET status = ?, server_message_id = ? WHERE id = ?`;
    connection.query(updateQuery, [status, serverMessageId, sentToId], (error, results) => {
        if (error) {
            console.error(`Error updating SentTo record with ID ${sentToId}:`, error);
        } else {
            console.log(`SentTo record with ID ${sentToId} updated successfully.`);
        }
    });
}

function updateIsDelivered(receiptedMessageId) {
    const updateQuery = `UPDATE sent_to SET is_delivered = ? WHERE server_message_id = ?`;
    connection.query(updateQuery, [1, receiptedMessageId], (error, results) => {
        if (error) {
            console.error(`Error updating is_delivered status for message with ID ${receiptedMessageId}:`, error);
        } else {
            console.log(`is_delivered status updated successfully for message with ID ${receiptedMessageId}`);
        }
    });
}

async function testConnection(session, maxAttempts = 10, currentAttempt = 1) {
    return new Promise((resolve, reject) => {
        console.log(`test : `, currentAttempt);
        setTimeout(async () => {
            if (currentAttempt > maxAttempts) {
                reject('Max attempts reached without establishing connection');
                return;
            }

            session.submit_sm({
                destination_addr: "961710034000",
                short_message: "test connection",
                registered_delivery: 1,
            }, async (submitPdu) => {
                if (submitPdu.command_status === 0) {
                    console.log(`Successful Connected`);
                    resolve();
                    return;
                } else {
                    console.error(`Error not Connected. Retrying...`);
                    try {
                        await testConnection(session, maxAttempts, currentAttempt + 1);
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                }
            });
        }, 2000);
    });
}

export async function updateCustomers(req, res) {
    try {
        console.log("update customers")
        await closeAllSessions();

        await addBindCredentials(req.body.user_id);

        return res.status(200).json({ message: 'Customers updated successfully.' });
    } catch (error) {
        console.error("An error occurred while updating customers:", error);
        return res.status(500).json({ error: 'An error occurred while updating customers.' });
    }
}

export async function sendSMS(req, res) {
    console.log(req.body);
    try {
        const session = smpp.connect({
            url: `smpp://${req.body.vendor.ip}:${req.body.vendor.port}`,
            auto_enquire_link_period: 10000,
            debug: true
        });

        // await selectCustomerCredentials(req.body.customer.id);

        await new Promise((resolve, reject) => {
            session.on('connect', () => {
                session.bind_transceiver({
                    system_id: req.body.vendor.username,
                    password: req.body.vendor.password,
                }, async (bindPdu) => {
                    if (bindPdu.command_status !== 0) {
                        console.error("Error binding to SMPP server:", bindPdu.command_status);
                        return reject({
                            code: 500,
                            message: 'Error binding to SMPP server',
                        });
                    }

                    session.on('error', (err) => {
                        console.error("An error occurred:", err);
                        return reject({
                            code: 500,
                            message: err,
                        });
                    });


                    const messages = req.body.sent_To;
                    const messagesNumber = messages.length;
                    const timeoutDuration = (req.body.delay * messagesNumber + 20) * 1000;
                    let messagesSuccess = 0;
                    let sentMessages = -1;
                    let deliveredMessages = 0;

                    const timeout = setTimeout(() => {
                        console.log('Timeout reached, closing connection...');
                        return resolve({
                            code: 500,
                            message: 'Request time out and not all messages have been delivered',
                            total: messagesNumber,
                            sent: sentMessages + 1,
                            delivered: deliveredMessages,
                            info_message: `${sentMessages + 1} out of ${messagesNumber} messages sent successfully.\n${deliveredMessages} out of ${messagesSuccess} messages delivered successfully.`

                        });

                    }, timeoutDuration);

                    session.on('deliver_sm', (deliverPdu) => {
                        session.send(deliverPdu.response());

                        const messageId = deliverPdu.receipted_message_id;
                        const testMessage = deliverPdu.source_addr;

                        if (messageId && testMessage != "961710034000") {
                            if (deliverPdu.command_status === 0) {
                                updateIsDelivered(messageId);
                                deliveredMessages++;
                                console.log(`${deliveredMessages} out of ${messagesSuccess} messages delivered successfully`);
                            } else {
                                console.error(`Error delivering message with ID ${messageId}:`, deliverPdu.command_status);
                            }
                        } else {
                            console.log("No received message id or it is a test message");
                        }

                        if (deliveredMessages === sentMessages) {
                            console.log('All deliveries received, closing connection...');
                            clearTimeout(timeout);
                            resolve({
                                code: 200,
                                total: messagesNumber,
                                sent: sentMessages,
                                delivered: deliveredMessages,
                                message: `${sentMessages} out of ${messagesNumber} messages sent successfully.\n${deliveredMessages} out of ${messagesNumber} messages delivered successfully.`

                            });
                        }
                    });

                    try {
                        await testConnection(session);
                    } catch (error) {
                        console.error("Failed to establish connection:", error);
                        return reject({
                            code: 500,
                            message: error
                        });
                    }

                    for (let i = 0; i < messagesNumber; i++) {
                        const message = messages[i];
                        await new Promise((innerResolve) => {
                            setTimeout(() => {
                                session.submit_sm({
                                    destination_addr: message.number,
                                    short_message: message.content,
                                    registered_delivery: 1,
                                }, (submitPdu) => {

                                    if (submitPdu.command_status === 0) {
                                        console.log(`Successful Message ID for ${message.number}:`, submitPdu.message_id);
                                        updateStatus(message.id, 'sent', submitPdu.message_id);
                                        messagesSuccess++;
                                        console.log(`${messagesSuccess} out of ${messagesNumber} messages sent successfully`);
                                        if (i === messagesNumber - 1) {
                                            sentMessages = messagesSuccess;
                                        }

                                    } else {
                                        console.error(`Error sending SMS to ${message.number}:`, submitPdu.command_status);
                                        updateStatus(message.id, 'failed', submitPdu.message_id);
                                    }
                                    innerResolve();
                                });
                            }, req.body.delay * 1000);
                        })
                            .catch(error => {
                                console.error('Error sending SMS:', error);
                                return reject({
                                    code: 500,
                                    message: error,
                                });
                            });
                    }

                    session.on('close', () => {
                        console.log("Connection closed by server");
                        resolve();
                    });
                });
            });
        }).then(result => {
            console.log('Resolved:', result);
            res.status(200).json(result);
        })
            .catch(error => {
                console.error('Rejected:', error);
                res.status(500).json(error);
            });
    } catch (error) {
        console.error("An error occurred:", error);
        res.status(500).json(error);
        return;
    }
}