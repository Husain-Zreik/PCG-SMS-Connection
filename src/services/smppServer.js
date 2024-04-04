var smpp = require('smpp');
var server = smpp.createServer({
	debug: true,
	rejectUnauthorized: false
}, function (session) {
	session.on('error', function (err) {
		console.log('Something ocurred, not listening for this event will terminate the program');
	});
	session.on('bind_transceiver', function (pdu) {
		session.pause();
		checkAsyncUserPass(pdu.system_id, pdu.password, function (err) {
			if (err) {
				session.send(pdu.response({
					command_status: smpp.ESME_RBINDFAIL
				}));
				session.close();
				return;
			}
			session.send(pdu.response());
			session.resume();
		});
	});
});

server.listen(2775);