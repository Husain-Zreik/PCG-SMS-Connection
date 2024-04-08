import { smppService, smppPort, smppTransmitterId, smppTransmitterPassword } from '../../config/smppConfig.js';

import smpp from 'smpp';


function connectToServer() {
    var session = smpp.connect({
        url: 'http://34.89.33.119:2770',
        //url: 'http://192.168.1.13:2775',
        //url: 'http://45.140.185.57:2775',
        //url: 'smpp://185.252.100.195:2775',
        auto_enquire_link_period: 10000,
        debug: true
    });

    session.on('connect', function () {
        console.log('Connected to server');

        // Attempt to bind_transceiver after successful connection
        session.bind_transceiver({
            system_id: 'alaac',
            password: 'alaac'
        }, function (pdu) {
            console.log("After binding");
            if (pdu.command_status === 0) {
                // Successfully bound
                session.submit_sm({
                    destination_addr: '96181857392',
                    short_message: 'Hello'
                }, function (pdu) {
                    if (pdu.command_status === 0) {
                        // Message successfully sent
                        console.log("Message ID:", pdu.message_id);
                    }
                });
            }
        });
    });

    session.on('error', function (err) {
        console.error("An error occurred:", err);
        // Retry connection after a delay
        setTimeout(connectToServer, 5000); // Retry after 5 seconds
    });

    session.on('close', function () {
        console.log('Connection closed');
        // Optionally handle connection closure here
    });
}

// Start the initial connection attempt
connectToServer();
