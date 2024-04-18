import { createServer } from 'smpp';
import connection from '../../config/dbConnection.js';

export default function startSMPPServer() {
	var server = createServer({
		debug: true,
		rejectUnauthorized: false,
	}, function (session) {
		session.on('error', function (err) {
			console.error('An error occurred:', err);
		});

		session.on('bind_transceiver', function (pdu) {
			session.pause();
			console.log("Received bind_transceiver request:", pdu);

			if ((pdu.system_id == 'alaac' && pdu.password == 'alaac') || (pdu.system_id == 'alaav' && pdu.password == 'alaav')) {
				session.send(pdu.response());
				session.resume();
			} else {
				session.send(pdu.response({ command_status: smpp.ESME_RBINDFAIL }));
				session.close();
			}

			session.on('submit_sm', function (pdu) {
				const messageID = generateMessageID();
				const sourceAddr = pdu.destination_addr;
				const messageContent = pdu.short_message.message;

				if (pdu.sm_default_msg_id === 1) {
					session.send(pdu.response({ message_id: messageID }));
				} else {
					session.send(pdu.response());
				}

				session.deliver_sm({
					destination_addr: sourceAddr,
					short_message: messageContent,
					message_id: messageID,
					esm_class: 4,
				}, function (deliverPdu) {
					if (deliverPdu.command_status != 255) {
						console.log(`Successful Message ID for ${sourceAddr}:`, deliverPdu.message_id);
						// updateDeliveredRecord(deliverPdu.message_id);
					}
				});
			});

			queue.on('message', function (message) {
				session.send(new smpp.PDU('deliver_sm', {
					esm_class: 4,
					short_message: message.text,
					source_addr: message.destination,
					destination_addr: message.source
				}));
			});

			session.on('enquire_link', function (pdu) {
				session.send(pdu.response());
			});
		});
	});

	server.listen(2775, function () {
		console.log('SMPP server listening on port 2775');
	});
}

let counter = 0;

function generateMessageID() {
	const timestamp = new Date().toISOString().replace(/\D/g, '').slice(0, -3);
	counter++;

	return `${timestamp}${counter.toString().padStart(3, '0')}`;
}


function updateDeliveredRecord(messageId) {
	if (!connection || connection.state === 'disconnected') {
		console.error('Database connection is not available or disconnected.');
		// Re-establish the database connection
		connection.connect((err) => {
			if (err) {
				console.error('Error reconnecting to the database:', err);
				return;
			}
			console.log('Reconnected to the database.');
			// After reconnection, execute the query
			executeUpdateQuery(messageId);
		});
	} else {
		// If the connection is available, execute the query directly
		executeUpdateQuery(messageId);
	}
}

function executeUpdateQuery(messageId) {
	const updateQuery = `UPDATE sent_to SET is_delivered = 1 WHERE id = ?`;

	connection.query(updateQuery, [messageId], (error, results) => {
		if (error) {
			console.error(`Error updating SentTo record with ID ${messageId}:`, error);
		} else {
			console.log(`SentTo record with ID ${messageId} delivered successfully.`);
		}
	});
}


startSMPPServer();
