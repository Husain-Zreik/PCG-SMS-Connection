import { encryptionKey } from '../../config/smppConfig.js';
import connection from '../../config/dbConnection.js';
import crypto from 'crypto';
import smpp from 'smpp';
import fecha from 'fecha';
import { loadDataFromFile, saveDataToFile } from './store.js';
const { format } = fecha;
const { createServer } = smpp;

let counter = 0;
let bindCredentials = {};
let activeSessionsGroups = {};
const counterFilePath = 'startup/counter.json';
const credentialsFilePath = 'startup/credentials.json';
const sessionsFilePath = 'startup/sessions.json';

function incrementCounter() {
	counter++;
	saveDataToFile(counterFilePath, counter);
}

function saveCredentials(credentials) {
	bindCredentials = credentials;
	saveDataToFile(credentialsFilePath, credentials);
}

function saveActiveSessions(sessions) {
	const sessionsWithoutSessionAttr = {};
	for (const userId in sessions) {
		if (sessions.hasOwnProperty(userId)) {
			const userSessions = sessions[userId].map(session => {
				const { session: omit, ...sessionInfo } = session;
				return sessionInfo;
			});
			sessionsWithoutSessionAttr[userId] = userSessions;
		}
	}

	activeSessionsGroups = sessionsWithoutSessionAttr;
	saveDataToFile(sessionsFilePath, sessionsWithoutSessionAttr);
}


export function restoreData() {
	counter = loadDataFromFile(counterFilePath) || 0;
	console.log(counter);
	bindCredentials = loadDataFromFile(credentialsFilePath) || {};
	console.log('bindCredentials: ', bindCredentials);
	activeSessionsGroups = loadDataFromFile(sessionsFilePath) || {};
	console.log('activeSessionsGroups :', activeSessionsGroups);
}

function generateMessageID() {
	const timestamp = new Date().toISOString().replace(/\D/g, '').slice(0, -3);
	incrementCounter()

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

function findKeyBySession(sessionToFind) {
	for (const key in activeSessionsGroups) {
		if (activeSessionsGroups.hasOwnProperty(key)) {
			const sessionsArray = activeSessionsGroups[key];
			const sessionInfo = sessionsArray.find(info => info.sessionId === sessionToFind._id);
			if (sessionInfo) {
				return key;
			}
		}
	}
	return null;
}

function findSessionInfoBySession(sessionToFind) {
	for (const key in activeSessionsGroups) {
		if (activeSessionsGroups.hasOwnProperty(key)) {
			const sessionsArray = activeSessionsGroups[key];
			const sessionInfo = sessionsArray.find(info => info.sessionId === sessionToFind._id);
			if (sessionInfo) {
				return sessionInfo;
			}
		}
	}
	return null;
}

export function validateEncryptionKey(key) {
	// Check if key is a string
	if (typeof key !== 'string') {
		throw new Error('Encryption key must be a string.');
	}
	// Check if key length is correct (AES-256 requires 64 hexadecimal characters)
	if (key.length !== 64) {
		throw new Error('Invalid key length. AES-256 encryption key must be 64 characters long.');
	}
	// Check if key is a valid hexadecimal string
	const hexRegex = /^[0-9a-fA-F]+$/;
	if (!hexRegex.test(key)) {
		throw new Error('Invalid key format. Encryption key must be a hexadecimal string.');
	}
	return true;
}

function decryptCustomerInfo(encryptedMessage, key) {
	validateEncryptionKey(key)
	const ivLength = 32;
	const iv = encryptedMessage.slice(0, ivLength);
	const encrypted = encryptedMessage.slice(ivLength + 1);
	const algorithm = 'aes-256-cbc';
	const decipher = crypto.createDecipheriv(algorithm, Buffer.from(key, 'hex'), Buffer.from(iv, 'hex'));
	let decrypted = decipher.update(Buffer.from(encrypted, 'hex'));
	decrypted = Buffer.concat([decrypted, decipher.final()]);
	return decrypted.toString('utf-8');
}

export default function startSMPPServer() {

	var server = createServer({
		debug: true,
		rejectUnauthorized: false,
	}, function (session) {

		session.on('bind_transceiver', function (pdu) {
			session.pause();
			console.log("Received bind_transceiver request");

			const ipv4Part = ipv6ToIpv4(session.socket.remoteAddress);
			let validCredentials = false;

			for (const key in bindCredentials) {
				const credential = bindCredentials[key];

				if (pdu.system_id === credential.username && pdu.password === credential.password && ipv4Part === credential.ip) {
					if (!activeSessionsGroups.hasOwnProperty(credential.user_id)) {
						activeSessionsGroups[credential.user_id] = [];
					}

					const sessionInfo = {
						sessionId: session._id,
						session: session,
						username: pdu.system_id,
						password: pdu.password,
						ip: ipv4Part,
					};
					activeSessionsGroups[credential.user_id].push(sessionInfo);
					saveActiveSessions(activeSessionsGroups)
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
				const currentTime = format(new Date(), 'YYMMDDHHmm');
				const messageContent = pdu.short_message.message;
				const sessionInfo = findSessionInfoBySession(session);

				const parts = messageContent.split(';');
				const firstWord = parts[0].trim();

				if (firstWord === 'T@sT') {

					const encryptedCustomerInfo = parts[1];
					const decryptedCustomerInfo = decryptCustomerInfo(encryptedCustomerInfo, encryptionKey);
					const [ip, username, password] = decryptedCustomerInfo.split(';');

					console.log('client / session', 'ip : ', ip, ' ', sessionInfo.ip, 'username', username, ' ', sessionInfo.username, 'password', password, ' ', sessionInfo.password);

					if (sessionInfo == null || sessionInfo.username != username || sessionInfo.password != password || sessionInfo.ip != ip) {
						console.log('The customer and vendor credentials are different from each others');
						session.send(pdu.response({ command_status: 12, }));
					} else {
						session.send(pdu.response({ message_id: messageID, }));
					}

				} else {
					session.send(pdu.response({ message_id: messageID }));
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
				const key = findKeyBySession(session);
				if (key !== null) {
					const index = activeSessionsGroups[key].findIndex(sessionInfo => sessionInfo.sessionId === session._id);
					if (index !== -1) {
						activeSessionsGroups[key].splice(index, 1);
						saveActiveSessions(activeSessionsGroups)
						console.log(`Removed session with sessionId ${session._id} from activeSessionsGroups[${key}]`);
					}
				} else {
					console.log('Session key not found for sessionId:', session._id);
				}
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

async function fetchCustomerDataFromDB(userId) {
	return new Promise((resolve, reject) => {
		const query = 'SELECT id, username, password, ip, port FROM carriers WHERE type = ? AND is_deleted = ? AND user_id =?';
		connection.query(query, ['customer', false, userId], (error, results) => {
			if (error) {
				reject(error);
			} else {
				const customers = results.map(customer => ({
					user_id: userId,
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

export async function addBindCredentials(userId) {
	try {
		const customerData = await fetchCustomerDataFromDB(userId);
		customerData.forEach(customer => {
			bindCredentials[customer.id] = {
				user_id: userId,
				username: customer.username,
				password: customer.password,
				ip: customer.ip,
				port: customer.port
			};
		});
		saveCredentials(bindCredentials);
		console.log('Credentials added for customers:', Object.keys(bindCredentials));
		console.log('bindCredentials:', bindCredentials);
	} catch (error) {
		console.error('Error adding customer credentials:', error);
	}
}

export async function closeAllSessions(userId) {
	try {
		if (activeSessionsGroups[userId]) {
			activeSessionsGroups[userId].forEach(sessionInfo => {
				const session = sessionInfo.session;
				session.unbind(() => {
					session.close();
				});
			});
			delete activeSessionsGroups[userId];
			saveActiveSessions(activeSessionsGroups)
			console.log("Removed Active Sessions for user:", userId);
		} else {
			console.log("No active sessions found for the user:", userId);
		}
	} catch (error) {
		console.error("An error occurred while closing sessions:", error);
	}
}
