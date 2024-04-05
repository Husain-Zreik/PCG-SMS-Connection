import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envPath = resolve(__dirname, '../.env');

dotenv.config({ path: envPath });

export const smppService = process.env.SMPP_SERVICE;
export const smppPort = parseInt(process.env.SMPP_PORT);
export const smppReceiverId = process.env.SMPP_RECEIVER_ID;
export const smppReceiverPassword = process.env.SMPP_RECEIVER_PASSWORD;
export const smppTransmitterId = process.env.SMPP_TRANSMITTER_ID;
export const smppTransmitterPassword = process.env.SMPP_TRANSMITTER_PASSWORD;