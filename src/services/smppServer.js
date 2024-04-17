import { createServer } from 'smpp';
import smpp from 'smpp';

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

			// Implement authentication logic here
			if ((pdu.system_id == 'alaac' && pdu.password == 'alaac') || (pdu.system_id == 'alaav' && pdu.password == 'alaav')) {
				// Accept the connection
				session.send(pdu.response());
				session.resume();
			} else {
				// Reject the connection
				session.send(pdu.response({ command_status: smpp.ESME_RBINDFAIL }));
				session.close();
			}
			session.on('submit_sm', function (submitPdu) {
				console.log("Received submit_sm request:", submitPdu);

				const sourceAddr = submitPdu.source_addr;
				const messageContent = submitPdu.short_message.message;
				const messageId = submitPdu.message_id;

				console.log(`Received SMS from ${sourceAddr}: ${messageContent}`);

				updateDeliveredRecord(messageId);
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