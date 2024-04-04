const smpp = require('smpp');
const { SMPP_HOST, SMPP_PORT, SMPP_USERNAME, SMPP_PASSWORD } = process.env;

exports.sendSMS = (req, res) => {
    const session = smpp.connect({
        url: `smpp://${SMPP_HOST}:${SMPP_PORT}`,
        auto_enquire_link_period: 10000,
        debug: true
    }, () => {
        session.bind_transceiver({
            system_id: SMPP_USERNAME,
            password: SMPP_PASSWORD
        }, (pdu) => {
            if (pdu.command_status === 0) {
                session.submit_sm({
                    destination_addr: req.body.destination,
                    short_message: req.body.message
                }, (pdu) => {
                    if (pdu.command_status === 0) {
                        res.status(200).json({ message: 'SMS sent successfully' });
                    } else {
                        res.status(500).json({ error: 'Error sending SMS' });
                    }
                });
            } else {
                res.status(500).json({ error: 'Error binding to SMPP server' });
            }
        });
    });
};
