import smpp from 'smpp';
import fecha from 'fecha';
const { format } = fecha;
const { createServer } = smpp;

let server;
let bindCredentials = {};

export default function startSMPPServer() {
	console.log("credentials :", bindCredentials);

	var server = createServer({
		debug: true,
		rejectUnauthorized: false,
	}, function (session) {

		// if (session.socket.remoteAddress !== customerIp) {
		// 	console.error('Invalid customer IP address or port');
		// 	session.close();
		// 	return;
		// }

		session.on('bind_transceiver', function (pdu) {
			session.pause();
			console.log("Received bind_transceiver request:", pdu);

			let validCredentials = false;

			for (const key in bindCredentials) {
				const credential = bindCredentials[key];
				if (pdu.system_id === credential.username && pdu.password === credential.password && session.socket.remoteAddress === credential.ip) {
					validCredentials = true;
					break;
				}
			}

			if (validCredentials) {
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
				const currentTime = format(new Date(), 'YYMMDDHHmm');

				session.send(pdu.response({ message_id: messageID }));

				// const buf = Buffer.from(`id:${messageID} sub:001 dlvrd:001 submit date:${format(new Date(), 'YYMMDDHHmm')} done date:${format(new Date(), 'YYMMDDHHmm')} stat:DELIVRD err:000 text:`);
				const deliveryReceiptMessage = `id:${messageID} sub:001 dlvrd:001 submit date:${currentTime} done date:${currentTime} stat:DELIVRD err:000 text: ${messageContent}`;

				session.deliver_sm({
					service_type: '',
					source_addr_ton: 0,
					source_addr: destinationAddr,
					dest_addr_ton: 0,
					dest_addr_npi: 0,
					destination_addr: '',
					esm_class: 4,
					protocol_id: 0,
					priority_flag: 0,
					schedule_delivery_time: '',
					validity_period: '',
					registered_delivery: 0,
					replace_if_present_flag: 0,
					data_coding: 0,
					sm_default_msg_id: 0,
					message_state: 2,
					receipted_message_id: messageID,
					short_message: {
						// udh: new Uint8Array(buf),
						message: deliveryReceiptMessage,
					},
				}, function (deliverPdu) {
					if (deliverPdu.command_status !== 255) {
						console.log(`Successful Message ID ${messageID}:`);
					} else {
						console.error(`Error sending SMS to ${messageID}:`);
					}
				});

			});

			session.on('error', function (err) {
				console.error('An error occurred:', err);
			});

			session.on('unbind', function (pdu) {
				session.send(pdu.response());
				session.close();
			});

			session.on('enquire_link', function (pdu) {
				session.send(pdu.response());
			});
		});
	});

	server.listen(2775, function () {
		console.log(`SMPP server listening on port 2775`);
	});
}

export function addBindCredentials(key, credential) {
	bindCredentials[key] = { ...credential };
}

export function removeBindCredentials(key) {
	delete bindCredentials[key];
}

let counter = 0;

function generateMessageID() {
	const timestamp = new Date().toISOString().replace(/\D/g, '').slice(0, -3);
	counter++;

	return `${timestamp}${counter.toString().padStart(3, '0')}`;
}

export function stopSMPPServer() {
	if (server) {
		server.close(() => {
			console.log('SMPP server stopped');
		});
	} else {
		console.warn('SMPP server is not running');
	}
}

startSMPPServer();
