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

			let sourceAddr;
			let messageContent;

			session.on('submit_sm', function (pdu) {
				console.log('submit_sm', pdu);
				const messageID = generateMessageID();
				session.send(pdu.response({ message_id: messageID }));
			});


			// session.deliver_sm({
			// 	destination_addr: sourceAddr,
			// 	short_message: messageContent,
			// }, function (deliverPdu) {
			// 	console.log("\n\deliverPdu", deliverPdu, "\n\n");
			// 	console.log(`Received SMS from ${sourceAddr}: ${messageContent}`);

			// 	updateDeliveredRecord(messageId);
			// });


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
