import { createServer } from 'smpp';
import connection from '../../config/dbConnection.js';

export default function startSMPPServer() {
	var server = createServer({
		debug: true,
		rejectUnauthorized: false,
	}, function (session) {
		session.on('error', function (err) {
			console.error('An error occurred:', err);
			// Optionally handle the error or terminate the program
		});

		console.log("New SMPP session opened");

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

			session.on('deliver_sm', function (pdu) {
				console.log('DELIVER_SM', pdu);
				console.log(pdu.short_message);

				const sourceAddr = pdu.source_addr;
				const messageContent = pdu.short_message.message;
				const messageId = pdu.message_id; // Make sure this property is correct

				console.log(`Received SMS from ${sourceAddr}: ${messageContent}`);

				updateDeliveredRecord(messageId);

				session.deliver_sm_resp({
					sequence_number: pdu.sequence_number,
					command_status: 0
				});
			});

			session.on('enquire_link', function (pdu) {
				console.log('ENQUIRE_LINK', pdu);
				session.send(pdu.response());
			});
		});
	});

	server.listen(2775, function () {
		console.log('SMPP server listening on port 2775');
	});
}

function updateDeliveredRecord(messageId) {
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
