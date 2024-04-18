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
				const destinationAddr = pdu.destination_addr;
				const messageContent = pdu.short_message.message;

				if (pdu.sm_default_msg_id === 1) {
					session.send(pdu.response({ message_id: messageID }));
				} else {
					session.send(pdu.response());
				}

				session.deliver_sm({
					source_addr: destinationAddr,
					short_message: messageContent,
					// receipted_message_id: messageID,
					esm_class: 4,
					// message_state: 2,
				}, function (deliverPdu) {
					if (deliverPdu.command_status != 255) {
						console.log(`Successful Message ID for ${destinationAddr}:`, deliverPdu.message_id);
						// updateDeliveredRecord(deliverPdu.message_id);
					}
				});
			});

			// session.send(new smpp.PDU('query_sm_resp', {
			// 	message_id: messageID,
			// 	final_date: '20240418',
			// 	message_state: 2,
			// 	error_code: 0,
			// }));

			session.on('deliver_sm', function (deliverPdu) {
				if (deliverPdu.esm_class === 4) {
					console.log("in esm_class");

				} else {
					console.log("not in esm_class");
				}
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
