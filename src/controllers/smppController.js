import smpp from 'smpp';
import connection from '../../config/dbConnection.js';
import startSMPPServer, { addBindCredentials, removeBindCredentials, stopSMPPServer } from '../services/smppServer.js';

export async function sendSMS(req, res) {

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

    try {
        const session = smpp.connect({
            url: `smpp://${req.body.vendor.ip}:${req.body.vendor.port}`,
            auto_enquire_link_period: 30000,
            debug: true
        });

        addBindCredentials(req.body.customer.id, req.body.customer);

        await new Promise((resolve, reject) => {
            session.on('connect', () => {
                session.bind_transceiver({
                    system_id: req.body.vendor.username,
                    password: req.body.vendor.password,
                }, async (bindPdu) => {
                    if (bindPdu.command_status !== 0) {
                        console.error("Error binding to SMPP server:", bindPdu.command_status);
                        res.status(500).json({ error: 'Error binding to SMPP server' });
                        reject(new Error('Error binding to SMPP server'));
                        return;
                    }

                    session.on('error', (err) => {
                        console.error("An error occurred:", err);
                        res.status(500).json({ error: 'An error occurred' });
                        reject(err);
                    });

                    // startSMPPServer(req.body.customer.ip, req.body.customer.port, req.body.customer.username, req.body.customer.password);

                    const messages = req.body.sent_To;
                    const messagesNumber = messages.length;
                    const timeoutDuration = (req.body.delay * messagesNumber + 60) * 1000;
                    let timeoutReached = false;
                    let messagesSuccess = 0;
                    let deliveredMessages = 0;

                    const timeout = setTimeout(() => {
                        timeoutReached = true;
                        console.log('Timeout reached, closing connection...');
                        session.unbind(() => {
                            session.close();
                            console.log('Connection closed');
                            res.status(500).json({
                                error: 'Request time out and not all messages has been delivered',
                                total: messagesNumber,
                                sent: messagesSuccess,
                                delivered: deliveredMessages,
                                message: `${messagesSuccess} out of ${messagesNumber} messages sent successfully.\n${deliveredMessages} out of ${messagesSuccess} messages delivered successfully.`
                            });
                            resolve();
                        });
                    }, timeoutDuration);

                    session.on('deliver_sm', (deliverPdu) => {
                        console.log('deliver_sm', deliverPdu);
                        session.send(deliverPdu.response());

                        const messageId = deliverPdu.receipted_message_id;
                        if (messageId) {
                            if (deliverPdu.command_status === 0) {
                                updateIsDelivered(messageId);
                                deliveredMessages++;
                                console.log(`${deliveredMessages} out of ${messagesSuccess} messages delivered successfully`);
                            } else {
                                console.error(`Error delivering message with ID ${messageId}:`, deliverPdu.command_status);
                            }
                        } else {
                            console.log("No recieved message id");
                        }
                    });

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
                                res.status(500).json({ error: 'Error sending SMS' });
                                reject(error);
                            });
                    }

                    if (deliveredMessages === messagesSuccess) {
                        console.log('All deliveries received closing connection...');
                        clearTimeout(timeout);
                        session.unbind(() => {
                            session.close();
                            console.log('Connection closed');
                            res.status(200).json({
                                total: messagesNumber,
                                sent: messagesSuccess,
                                delivered: deliveredMessages,
                                message: `${messagesSuccess} out of ${messagesNumber} messages sent successfully.\n${deliveredMessages} out of ${messagesSuccess} messages delivered successfully.`
                            });
                            resolve();
                        });
                    }

                    session.on('close', () => {
                        removeBindCredentials(req.body.customer.id);
                        console.log("Connection closed");
                    });
                });
            });
        });
    } catch (error) {
        console.error("An error occurred:", error);
        res.status(500).json({ error: 'An error occurred' });
    }
}

export function receiveSMS(req, res) {
    // Implement the logic to receive SMS messages
}
