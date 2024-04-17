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
		});
	});

	server.listen(2775, function () {
		console.log('SMPP server listening on port 2775');
	});
}
startSMPPServer();