import smpp from 'smpp';
import connection from '../../config/dbConnection.js';

export async function sendSMS(req, res) {
    function updateSentRecord(sentToId, status, serverMessageId) {
        const updateQuery = `UPDATE sent_to SET status = ?, server_message_id = ? WHERE id = ?`;
        connection.query(updateQuery, [status, serverMessageId, sentToId], (error, results) => {
            if (error) {
                console.error(`Error updating SentTo record with ID ${sentToId}:`, error);
            } else {
                console.log(`SentTo record with ID ${sentToId} updated successfully.`);
            }
        });
    }

    try {
        const session = smpp.connect({
            url: `smpp://${req.body.vendor.ip}:${req.body.vendor.port}`,
            auto_enquire_link_period: 30000,
            debug: true
        });

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

                    const messages = req.body.sent_To;
                    const messagesNumber = messages.length;
                    let messagesSuccess = 0;

                    for (let i = 0; i < messagesNumber; i++) {
                        const message = messages[i];
                        await new Promise((innerResolve, innerReject) => {
                            setTimeout(() => {
                                session.submit_sm({
                                    destination_addr: message.number,
                                    short_message: message.content,
                                    registered_delivery: 1,
                                }, (submitPdu) => {
                                    if (submitPdu.command_status !== 0) {
                                        console.error(`Error sending SMS to ${message.number}:`, submitPdu.command_status);
                                        updateSentRecord(message.id, 'failed', submitPdu.message_id);
                                        innerReject(new Error(`Error sending SMS to ${message.number}`));
                                        return;
                                    }

                                    console.log(`Successful Message ID for ${message.number}:`, submitPdu.message_id);
                                    updateSentRecord(message.id, 'sent', submitPdu.message_id);
                                    messagesSuccess++;

                                    if (messagesSuccess === messagesNumber) {
                                        console.log(`${messagesSuccess} out of ${messagesNumber} messages sent successfully`);
                                        res.status(200).json({ success: messagesSuccess, total: messagesNumber, message: `${messagesSuccess} out of ${messagesNumber} messages sent successfully` });
                                        resolve();
                                    }

                                    innerResolve();
                                });
                            }, req.body.delay * 1000);
                        });
                    }

                    session.on('deliver_sm', (deliverPdu) => {
                        console.log('deliver_sm', deliverPdu);
                        session.send(deliverPdu.response());
                    });

                    session.on('error', (err) => {
                        console.error("An error occurred:", err);
                        res.status(500).json({ error: 'An error occurred' });
                        reject(err);
                    });

                    session.on('close', () => {
                        console.log('Connection closed');
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
