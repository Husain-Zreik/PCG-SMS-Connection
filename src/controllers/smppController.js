import { addBindCredentials, closeUserSessions, validateEncryptionKey } from '../services/smppServer.js';
import { encryptionKey } from '../../config/smppConfig.js';
import connection from '../../config/dbConnection.js';
import crypto from 'crypto';
import smpp from 'smpp';

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

function encryptCustomerInfo(customer, key) {
    validateEncryptionKey(key)
    const message = `${customer.ip};${customer.username};${customer.password}`;
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);
    let encrypted = cipher.update(message, 'utf-8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
}

async function testConnection(req, encryptedCustomerInfo, testN, session, maxAttempts = 10, currentAttempt = 1) {
    return new Promise((resolve, reject) => {
        console.log(`test : `, currentAttempt);
        setTimeout(async () => {
            if (currentAttempt > maxAttempts) {
                reject('Max attempts reached without establishing connection. Check the credentials if they are correct !');
                return;
            }

            session.submit_sm({
                destination_addr: testN,
                short_message: `T@sT;${encryptedCustomerInfo}`,
                registered_delivery: 1,
            }, async (submitPdu) => {
                if (submitPdu.command_status === 0) {
                    console.log(`Successful Connected`);
                    resolve();
                    return;
                } else {
                    console.error(`Error not Connected. Retrying...`);
                    try {
                        await testConnection(req, encryptedCustomerInfo, testN, session, maxAttempts, currentAttempt + 1);
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                }
            });
        }, 5000);
    });
}

export async function updateCustomers(req, res) {
    try {
        console.log("update customers")
        await closeUserSessions(req.body.user_id);

        await addBindCredentials(req.body.user_id);

        return res.status(200).json({ message: 'Customers updated successfully.' });
    } catch (error) {
        console.error("An error occurred while updating customers:", error);
        return res.status(500).json({ error: 'An error occurred while updating customers.' });
    }
}

export async function sendSMS(req, res) {

    const messages = req.body.sent_To;
    const messagesNumber = messages.length;
    const testNumber = messages[0].number;
    let timeoutDuration = (req.body.delay * messagesNumber + 150) * 1000;
    let messagesSuccess = 0;
    let messagesFailed = 0;
    let sentMessages = -1;
    let deliveredMessages = 0;

    try {
        const session = smpp.connect({
            url: `smpp://${req.body.vendor.ip}:${req.body.vendor.port}`,
            auto_enquire_link_period: 20000,
            debug: true
        });

        session.once('timeout', () => {
            console.error("Connection timed out");
            return res.status(500).json({
                code: 500,
                message: 'Connection to SMPP server timed out'
            });
        });

        session.on('error', (err) => {
            console.error("An error occurred:", err);
            return res.status(500).json({
                code: 500,
                message: err.message,
                error: err
            });
        });

        session.on('close', () => {
            console.log("Connection closed by server");
        });

        session.once('uncaughtException', (err) => {
            console.error("An uncaught exception occurred:", err);
            return res.status(500).json({
                code: 500,
                message: 'An unexpected error occurred',
                error: err
            });
        });

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
                            message: 'Error binding to SMPP server(vendor) check the credentials',
                        });
                    }

                    session.on('deliver_sm', (deliverPdu) => {
                        session.send(deliverPdu.response());

                        const messageId = deliverPdu.short_message.message.split(' ')[0].split(':')[1];

                        if (messageId && deliverPdu.command_status === 0) {
                            updateIsDelivered(messageId);
                            deliveredMessages++;
                            console.log(`${deliveredMessages} out of ${messagesSuccess} messages delivered successfully`);
                        } else if (messageId) {
                            console.error(`Error delivering message with ID ${messageId}:`, deliverPdu.command_status);
                        }

                        if (deliveredMessages === sentMessages) {
                            console.log('All deliveries received, closing connection...');
                            clearTimeout(timeout);
                            resolve({
                                code: 200,
                                total: messagesNumber,
                                sent: messagesSuccess,
                                delivered: deliveredMessages,
                                message: `${messagesSuccess} out of ${messagesNumber} messages sent successfully.\n${deliveredMessages} out of ${messagesSuccess} messages delivered successfully.`
                            });
                        }
                    });

                    try {
                        const encryptedCustomerInfo = encryptCustomerInfo(req.body.customer, encryptionKey);
                        await testConnection(req, encryptedCustomerInfo, testNumber, session);
                    } catch (error) {
                        console.error("Failed to establish connection:", error);
                        return reject({
                            code: 500,
                            message: error
                        });
                    }

                    const timeout = setTimeout(() => {
                        console.log('Timeout reached, closing connection...');
                        return resolve({
                            code: 500,
                            message: 'Request time out and not all messages have been delivered',
                            total: messagesNumber,
                            sent: messagesSuccess,
                            delivered: deliveredMessages,
                            info_message: `${messagesSuccess} out of ${messagesNumber} messages sent successfully.\n${deliveredMessages} out of ${messagesSuccess} messages delivered successfully.`
                        });
                    }, timeoutDuration);

                    for (let i = 0; i < messagesNumber; i++) {
                        const message = messages[i];
                        let isSent;
                        let failure = 0;
                        await new Promise((innerResolve) => {
                            setTimeout(() => {
                                session.submit_sm({
                                    destination_addr: message.number,
                                    short_message: message.content,
                                    source_addr: message.source,
                                    registered_delivery: 1,
                                }, (submitPdu) => {

                                    if (submitPdu.command_status === 0) {
                                        console.log(`Successful Message ID for ${message.number}:`, submitPdu.message_id);
                                        updateStatus(message.id, 'sent', submitPdu.message_id);
                                        messagesSuccess++;
                                        isSent = 1;
                                        failure = 0;
                                        console.log(`${messagesSuccess} out of ${messagesNumber} messages sent successfully`);
                                    } else {
                                        console.error(`Error sending SMS to ${message.number}:`, submitPdu.command_status);
                                        messagesFailed++;
                                        isSent = 0;
                                        failure++;
                                        updateStatus(message.id, 'failed', submitPdu.message_id);
                                    }

                                    if (failure === 5) {
                                        resolve({
                                            code: 500,
                                            message: 'More than 10 messages failed to be sent. Connection Error ...',
                                            total: messagesNumber,
                                            sent: messagesSuccess,
                                            delivered: deliveredMessages,
                                            info_message: `${messagesSuccess} out of ${messagesNumber} messages sent successfully.\n${deliveredMessages} out of ${messagesSuccess} messages delivered successfully.`
                                        })
                                    }

                                    if (i === messagesNumber - 1) {
                                        console.log("in the last iteration");
                                        sentMessages = messagesSuccess + messagesFailed;
                                        if (!isSent) {
                                            console.log('All deliveries received, closing connection...');
                                            clearTimeout(timeout);
                                            resolve({
                                                code: 200,
                                                total: messagesNumber,
                                                sent: messagesSuccess,
                                                delivered: deliveredMessages,
                                                message: `${messagesSuccess} out of ${messagesNumber} messages sent successfully.\n${deliveredMessages} out of ${messagesSuccess} messages delivered successfully.`
                                            });
                                        }
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