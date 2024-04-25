import connection from '../../config/dbConnection.js';
import smpp from 'smpp';
import fecha from 'fecha';
const { format } = fecha;
const { createServer } = smpp;

let counter = 0;
let bindCredentials = {};

function generateMessageID() {
	const timestamp = new Date().toISOString().replace(/\D/g, '').slice(0, -3);
	counter++;

	return `${timestamp}${counter.toString().padStart(3, '0')}`;
}

function ipv6ToIpv4(ipv6Address) {
	if (ipv6Address.startsWith('::ffff:')) {
		const ipv4Part = ipv6Address.split(':').slice(-1)[0];
		return ipv4Part;
	} else {
		return ipv6Address;
	}
}

export default function startSMPPServer() {

	var server = createServer({
		debug: true,
		rejectUnauthorized: false,
	}, function (session) {

		session.on('bind_transceiver', function (pdu) {
			session.pause();
			console.log("Received bind_transceiver request:", pdu);

			// let validCredentials = false;

			// for (const key in bindCredentials) {
			// 	const credential = bindCredentials[key];
			// 	const ipv4Part = ipv6ToIpv4(session.socket.remoteAddress);
			// 	if (pdu.system_id === credential.username && pdu.password === credential.password && ipv4Part === credential.ip) {
			// 		validCredentials = true;
			// 		break;
			// 	}
			// }

			session.send(pdu.response());
			// if (validCredentials) {
			// 	session.send(pdu.response());
			// 	session.resume();
			// } else {
			// 	session.send(pdu.response({ command_status: smpp.ESME_RBINDFAIL }));
			// 	session.close();
			// }

			session.on('submit_sm', function (pdu) {
				const messageID = generateMessageID();
				const destinationAddr = pdu.destination_addr;
				const messageContent = pdu.short_message.message;
				const currentTime = format(new Date(), 'YYMMDDHHmm');

				session.send(pdu.response({ message_id: messageID }));

				const deliveryReceiptMessage = `id:${messageID} sub:001 dlvrd:001 submit date:${currentTime} done date:${currentTime} stat:DELIVRD err:000 text: ${messageContent}`;

				// session.deliver_sm({
				// 	service_type: '',
				// 	source_addr_ton: 0,
				// 	source_addr: destinationAddr,
				// 	dest_addr_ton: 0,
				// 	dest_addr_npi: 0,
				// 	destination_addr: '',
				// 	esm_class: 4,
				// 	protocol_id: 0,
				// 	priority_flag: 0,
				// 	schedule_delivery_time: '',
				// 	validity_period: '',
				// 	registered_delivery: 0,
				// 	replace_if_present_flag: 0,
				// 	data_coding: 0,
				// 	sm_default_msg_id: 0,
				// 	message_state: 2,
				// 	receipted_message_id: messageID,
				// 	short_message: {
				// 		message: deliveryReceiptMessage,
				// 	},
				// });

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

async function fetchCustomerDataFromDB() {
	return new Promise((resolve, reject) => {
		const query = 'SELECT id, username, password, ip, port FROM carriers WHERE type = ? AND is_deleted = ?';
		connection.query(query, ['customer', false], (error, results) => {
			if (error) {
				reject(error);
			} else {
				resolve(results);
			}
		});
	});
}

export async function addBindCredentials() {
	try {
		const customerData = await fetchCustomerDataFromDB();
		customerData.forEach(customer => {
			bindCredentials[customer.id] = {
				username: customer.username,
				password: customer.password,
				ip: customer.ip,
				port: customer.port
			};
		});
		console.log('Credentials added for customers:', Object.keys(bindCredentials));
	} catch (error) {
		console.error('Error adding customer credentials:', error);
	}
}

// export function addBindCredentials(key, credential) {
// 	bindCredentials[key] = { ...credential };
// }

// export function removeBindCredentials(key) {
// 	if (bindCredentials[key]) {
// 		delete bindCredentials[key];
// 		console.log(`Credentials for customer ${key} removed.`);
// 	} else {
// 		console.log(`No credentials found for customer ${key}.`);
// 	}
// }

startSMPPServer()