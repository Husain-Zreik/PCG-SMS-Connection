var smpp = require('smpp');

var session = smpp.connect({
    url: 'http://34.89.33.119:2770',
    auto_enquire_link_period: 10000,
    debug: true
}, function() {
    session.bind_transceiver({
        system_id: 'alaac',
        password: 'alaac'
    }, function(pdu) {
        if (pdu.command_status === 0) {
            // Successfully bound
            session.submit_sm({
                destination_addr: '96181857392',
                short_message: 'Hello!'
            }, function(pdu) {
                if (pdu.command_status === 0) {
                    // Message successfully sent
                    console.log(pdu.message_id);
                }
            });
        }
    });
});
