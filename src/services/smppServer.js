import connection from '../../config/dbConnection.js';
import smpp from 'smpp';
import fecha from 'fecha';
const { format } = fecha;
const { createServer } = smpp;

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
					session.send(pdu.response());
				} else {
					session.send(pdu.response({ message_id: messageID }));
				}
				// const buf = Buffer.from(`id:${messageID} sub:001 dlvrd:001 submit date:${format(new Date(), 'YYMMDDHHmm')} done date:${format(new Date(), 'YYMMDDHHmm')} stat:DELIVRD err:000 text:`);

				// var deliver_sm = {
				// 	service_type: '',
				// 	source_addr_ton: 0,
				// 	source_addr_npi: 0,
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
				// 	short_message: {
				// 		// udh: new Uint8Array(buf),
				// 		// message: new Uint8Array(buf),
				// 		message: `id:${messageID} sub:001 dlvrd:001 submit date:${format(new Date(), 'YYMMDDHHmm')} done date:${format(new Date(), 'YYMMDDHHmm')} stat:DELIVRD err:000 text:`,
				// 	},
				// 	message_state: 2,
				// 	receipted_message_id: messageID,
				// };
				// var pdu = new smpp.PDU('deliver_sm', deliver_sm);
				// session.send(pdu);
				// console.log(pdu);

				const currentTime = format(new Date(), 'YYMMDDHHmm');

				// Construct the delivery receipt message string
				const deliveryReceiptMessage = `id:${messageID} sub:001 dlvrd:001 submit date:${currentTime} done date:${currentTime} stat:DELIVRD err:000 text:`;

				// Create the deliver_sm object with the formatted short_message
				const deliver_sm = {
					service_type: '',
					source_addr_ton: 0,
					source_addr_npi: 0,
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
					short_message: {
						message: deliveryReceiptMessage,
					},
					message_state: 2,
					receipted_message_id: messageID,
				};

				// Create and send the PDU
				const hi = new smpp.PDU('deliver_sm', deliver_sm);
				session.send(hi);
				console.log(hi);



				// var deliver_sm = {
				// 	service_type: '',
				// 	source_addr_ton: 0,
				// 	source_addr_npi: 0,
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
				// 	short_message: {
				// 		message_id: messageID + "second delivery",
				// 		message: messageContent
				// 	}
				// };
				// var pdu = new smpp.PDU('deliver_sm', deliver_sm);
				// session.send(pdu);

				// session.deliver_sm({
				// 	source_addr: destinationAddr,
				// 	short_message: messageContent,
				// 	esm_class: 4,
				// }, function (deliverPdu) {
				// 	if (deliverPdu.command_status != 255) {
				// 		console.log(`Successful Message ID for ${destinationAddr}:`, deliverPdu.message_id);
				// 		// updateDeliveredRecord(deliverPdu.message_id);
				// 	}
				// });
			});

			// session.send(new smpp.PDU('query_sm_resp', {
			// 	message_id: messageID,
			// 	final_date: '20240418',
			// 	message_state: 2,
			// 	error_code: 0,
			// }));

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
