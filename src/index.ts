'use strict';

import path = require('path');
import { JSEngine } from './engine/js-engine';
import { getLogger } from './logger/logger';

const logger = getLogger({ source: 'JsEngine' });

logger.info('Starting');
if (require.main === module) {
    const process = require('process');
    const parameters = process.argv.slice(2);
    //
    // if (parameters.length != 1) {
    //     logger.info("No scripts dir provided; exiting");
    //     process.exit(1);
    // }

    let scriptsParam = parameters[0];
    const dir = scriptsParam ? path.resolve(scriptsParam) : path.resolve(__dirname, '../dist/scripts');
    const token: string | undefined = process.env.HASS_TOKEN;

    if (!token) {
        console.error('HASS_TOKEN environment variable not set');
        process.exit(2);
    }

    // const url = 'http://127.0.0.1:8123';
    const url = 'http://172.16.2.210:8123';

    const ha = new JSEngine({ dir, token, url }, logger);

    const shutdown = () => {
        ha.stop();
        // process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    process.on('uncaughtException', (err: any) => logger.error(err));

    ha.start().catch((e: any) => {
        logger.error(e);
        shutdown();
    });
}

export = JSEngine;
