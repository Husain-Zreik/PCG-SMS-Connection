import smpp from 'smpp';
import connection from '../../config/dbConnection.js';

// export function sendSMS(req, res) {
//     const session = smpp.connect({
//         url: `smpp://${req.body.vendor.ip}:${req.body.vendor.port}`,
//         auto_enquire_link_period: 30000,
//         debug: true
//     });

//     let messagesNumber = 0;
//     let messagesSuccess = 0;

//     session.on('connect', function () {
//         session.bind_transceiver({
//             system_id: req.body.vendor.username,
//             password: req.body.vendor.password,
//         }, function (bindPdu) {
//             // console.log("bindPdu", bindPdu);
//             if (bindPdu.command_status === 0) {
//                 const messages = req.body.sent_To;

//                 messagesNumber = messages.length;

//                 messages.forEach((message, index) => {
//                     setTimeout(() => {
//                         session.submit_sm({
//                             destination_addr: message.number,
//                             short_message: message.content,
//                             sm_default_msg_id: 1,
//                         }, function (submitPdu) {
//                             if (submitPdu.command_status != 255) {
//                                 console.log(`Successful Message ID for ${message.number}:`, submitPdu.message_id);
//                                 messagesSuccess++;
//                                 updateSentRecord(message.id, 'sent', submitPdu.message_id);
//                             } else {
//                                 console.error(`Error sending SMS to ${message.number}:`, submitPdu.command_status);
//                                 updateSentRecord(message.id, 'failed', submitPdu.message_id);
//                             }
//                             session.on('deliver_sm', function (deliverPdu) {

//                                 const sourceAddr = deliverPdu.source_addr;
//                                 const messageContent = deliverPdu.short_message.message;

//                                 console.log('deliver_sm', deliverPdu);
//                                 session.send(deliverPdu.response({ message_id: submitPdu.message_id }));
//                                 console.log(`Received SMS from ${sourceAddr}: ${messageContent}`);
//                             });
//                         });
//                     }, req.body.delay * 1000);
//                     console.log(index);
//                     if (index === messagesNumber) {
//                         console.log(`${messagesSuccess} out of ${messagesNumber} messages sent successfully`);
//                         res.status(200).json({ success: messagesSuccess, total: messagesNumber, message: `${messagesSuccess} out of ${messagesNumber} messages sent successfully` });
//                     }
//                 });
//             } else {
//                 console.error("Error binding to SMPP server:", bindPdu.command_status);
//                 res.status(500).json({ error: 'Error binding to SMPP server' });
//             }
//         });
//     });

//     session.on('error', function (err) {
//         console.error("An error occurred:", err);
//         res.status(500).json({ error: 'An error occurred' });
//     });

//     session.on('close', function () {
//         console.log('Connection closed');
//     });

//     function updateSentRecord(sentToId, status, serverMessageId) {
//         const updateQuery = `UPDATE sent_to SET status = ?, server_message_id = ? WHERE id = ?`;

//         connection.query(updateQuery, [status, serverMessageId, sentToId], (error, results) => {
//             if (error) {
//                 console.error(`Error updating SentTo record with ID ${sentToId}:`, error);
//             } else {
//                 console.log(`SentTo record with ID ${sentToId} updated successfully.`);
//             }
//         });
//     }
// }

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

        let messagesNumber = 0;
        let messagesSuccess = 0;

        await new Promise((resolve, reject) => {
            session.on('connect', function () {
                session.bind_transceiver({
                    system_id: req.body.vendor.username,
                    password: req.body.vendor.password,
                }, function (bindPdu) {
                    if (bindPdu.command_status === 0) {

                        const messages = req.body.sent_To;
                        messagesNumber = messages.length;

                        const processMessage = async (message) => {
                            return new Promise((resolve, reject) => {
                                setTimeout(() => {
                                    session.submit_sm({
                                        destination_addr: message.number,
                                        short_message: message.content,
                                        sm_default_msg_id: 1,
                                        registered_delivery: 1,
                                    }, function (submitPdu) {
                                        if (submitPdu.command_status !== 255) {
                                            console.log(`Successful Message ID for ${message.number}:`, submitPdu.message_id);
                                            updateSentRecord(message.id, 'sent', submitPdu.message_id);
                                            resolve(submitPdu.message_id);
                                        } else {
                                            console.error(`Error sending SMS to ${message.number}:`, submitPdu.command_status);
                                            updateSentRecord(message.id, 'failed', submitPdu.message_id);
                                            reject(new Error(`Error sending SMS to ${message.number}`));
                                        }
                                    });
                                }, req.body.delay * 1000);
                            });
                        };

                        const processMessagesSequentially = async () => {
                            for (let i = 0; i < messages.length; i++) {
                                await processMessage(messages[i], i);
                            }
                        };

                        processMessagesSequentially()
                            .then(() => {
                                console.log(`${messagesSuccess} out of ${messagesNumber} messages sent successfully`);
                                res.status(200).json({ success: messagesSuccess, total: messagesNumber, message: `${messagesSuccess} out of ${messagesNumber} messages sent successfully` });
                                resolve();
                            })
                            .catch((error) => {
                                console.error("Error sending SMS messages:", error);
                                res.status(500).json({ error: 'Error sending SMS messages' });
                                reject(error);
                            });
                    } else {
                        console.error("Error binding to SMPP server:", bindPdu.command_status);
                        res.status(500).json({ error: 'Error binding to SMPP server' });
                        reject(new Error('Error binding to SMPP server'));
                    }
                });
            });

            session.on('pdu', function (pdu) {
                console.log('####### PDU ########');
                console.log(pdu)
            });

            // session.query_sm({
            //     message_id: 'your_message_id_here',
            //     source_addr: 'source_address_here',
            //     source_addr_ton: 1,
            //     source_addr_npi: 1,
            // }, function (responsePdu) {
            //     console.log('Response to query_sm request:', responsePdu);
            // });

            session.on('deliver_sm', function (deliverPdu) {
                console.log('deliver_sm', deliverPdu);
                session.send(deliverPdu.response());
                // console.log(`Received SMS from ${deliverPdu.source_addr}: ${deliverPdu.short_message.message}`);
            });

            session.on('error', function (err) {
                console.error("An error occurred:", err);
                res.status(500).json({ error: 'An error occurred' });
                reject(err);
            });

            session.on('close', function () {
                console.log('Connection closed');
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
