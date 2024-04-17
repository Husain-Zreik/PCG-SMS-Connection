import smpp from 'smpp';
import connection from '../../config/dbConnection.js';

export function sendSMS(req, res) {
    console.log("Request data:", req.body);

    const session = smpp.connect({
        url: `smpp://${req.body.vendor.ip}:${req.body.vendor.port}`,
        auto_enquire_link_period: 10000,
        debug: true
    });

    let messagesSent = 0;
    let messagesSuccess = 0;

    session.on('connect', function () {
        session.bind_transceiver({
            system_id: req.body.vendor.username,
            password: req.body.vendor.password,
        }, function (bindPdu) {
            console.log("bindPdu", bindPdu);
            if (bindPdu.command_status === 0) {
                const messages = req.body.sent_To;

                messagesSent = messages.length;

                messages.forEach((message, index) => {
                    setTimeout(() => {
                        session.submit_sm({
                            destination_addr: message.number,
                            short_message: message.content,
                            sm_default_msg_id: message.id,
                        }, function (submitPdu) {
                            console.log("submit_sm", submit_sm);
                            if (submitPdu.command_status === 0) {
                                console.log(`Successful Message ID for ${message.number}:`, submitPdu.message_id);
                                messagesSuccess++;

                                updateSentRecord(message.id, 'sent');

                                if (messagesSuccess === messagesSent) {
                                    console.log(`${messagesSuccess} out of ${messagesSent} messages sent successfully`);
                                    res.status(200).json({ success: messagesSuccess, total: messagesSent });
                                }
                            } else {
                                console.error(`Error sending SMS to ${message.number}:`, submitPdu.command_status);
                                if (index === messagesSent - 1) {
                                    res.status(500).json({ error: `Error sending SMS to ${message.number}` });
                                }

                                updateSentRecord(message.id, 'failed');
                            }
                        });
                    }, req.body.delay * 1000);
                });
            } else {
                console.error("Error binding to SMPP server:", bindPdu.command_status);
                res.status(500).json({ error: 'Error binding to SMPP server' });
            }
        });
    });

    session.on('error', function (err) {
        console.error("An error occurred:", err);
        res.status(500).json({ error: 'An error occurred' });
    });

    session.on('close', function () {
        console.log('Connection closed');
    });

    function updateSentRecord(sentToId, status) {
        const updateQuery = `UPDATE sent_to SET status = ? WHERE id = ?`;

        connection.query(updateQuery, [status, sentToId], (error, results) => {
            if (error) {
                console.error(`Error updating SentTo record with ID ${sentToId}:`, error);
            } else {
                console.log(`SentTo record with ID ${sentToId} updated successfully.`);
            }
        });
    }
}

export function receiveSMS(req, res) {
    // Implement the logic to receive SMS messages
}
