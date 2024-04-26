import connection from '../../config/dbConnection.js';
import smpp from 'smpp';
import fecha from 'fecha';
const { format } = fecha;
const { createServer } = smpp;

let counter = 0;
let bindCredentials = {};
const activeSessions = [];
let selectedCustomerCredentials = {};

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

		console.log(session);
		activeSessions.push(session);

		session.on('bind_transceiver', function (pdu) {
			session.pause();
			console.log("Received bind_transceiver request:", pdu);

			const ipv4Part = ipv6ToIpv4(session.socket.remoteAddress);
			let validCredentials = false;

			for (const key in bindCredentials) {
				const credential = bindCredentials[key];
				if (pdu.system_id === credential.username && pdu.password === credential.password && ipv4Part === credential.ip) {
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
				if (messageContent != "test connection") {

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
							message: deliveryReceiptMessage,
						},
					});
				}
			});

			session.on('error', function (err) {
				console.error('An error occurred:', err);
			});

			session.on('unbind', function (pdu) {
				session.send(pdu.response());
				session.close();
			});

			session.on('close', () => {
				console.log('Session closed by Client');
				activeSessions.splice(activeSessions.indexOf(session), 1);
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

async function fetchCustomerDataFromDB(user_id) {
	return new Promise((resolve, reject) => {
		const query = 'SELECT id, username, password, ip, port FROM carriers WHERE type = ? AND is_deleted = ? AND user_id =?';
		connection.query(query, ['customer', false, user_id], (error, results) => {
			if (error) {
				reject(error);
			} else {
				const customers = results.map(customer => ({
					id: customer.id,
					username: customer.username,
					password: Buffer.from(customer.password, 'base64').toString('utf-8'),
					ip: customer.ip,
					port: customer.port
				}));
				resolve(customers);
			}
		});
	});
}

export async function addBindCredentials(user_id) {
	try {
		const customerData = await fetchCustomerDataFromDB(user_id);
		customerData.forEach(customer => {
			bindCredentials[customer.id] = {
				username: customer.username,
				password: customer.password,
				ip: customer.ip,
				port: customer.port
			};
		});
		console.log('Credentials added for customers:', Object.keys(bindCredentials));
		console.log('bindCredentials:', bindCredentials);
	} catch (error) {
		console.error('Error adding customer credentials:', error);
	}
}

export async function selectCustomerCredentials(customerId) {
	try {
		console.log(customerId);
		if (bindCredentials.hasOwnProperty(customerId)) {
			selectedCustomerCredentials = bindCredentials[customerId];
			console.log('selectedCustomerCredentials:', selectedCustomerCredentials);
		} else {
			throw new Error(`Customer with ID ${customerId} not found.`);
		}
	} catch (error) {
		console.error('Error selecting customer credentials:', error);
	}
}

export async function closeAllSessions() {

	activeSessions.forEach(session => {
		session.unbind(() => {
			session.close();
		});
	});
	console.log("Removed Active Sessions");
}
