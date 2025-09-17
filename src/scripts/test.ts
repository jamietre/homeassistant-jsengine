import { Logger } from '../logger/logger';
import { HaEntity, HaEvent } from '../types/ha-types';
import { HaEventMap, HaEvents, JsEngine, JsModule, JsModuleConfig, TopicProvider } from '../types/jsmodule';

class TestConsumer implements JsModule {
    private logger: Logger;
    private getTopic: TopicProvider;
    private engine: JsEngine;
    constructor(options: JsModuleConfig) {
        this.logger = options.loggerFactory({ source: 'TestConsumer' });
        this.getTopic = options.getTopic;
        this.engine = options.engine;
    }

    started() {
        this.logger.debug('Started');
        const topic = this.getTopic('sensor.s31_id2_current');
        topic.subscribe('updated', (evt) => {
            this.logger.info(`Updated: ${evt.id}`);
            this.logger.info(`entity`, evt);
        });

        const regexTopic = this.getTopic(/sensor\./);
        regexTopic.subscribeAll(this.sensorUpdated);
    }

    sensorUpdated = (evt: HaEvents) => {
        this.logger.info(`${evt.id} UPDATED`);
        if (evt.entity.domain === 'light') {
            evt.entity.toggle();
        }
    };
    stopped() {
        this.logger.debug('Stopped');
    }
}

export default TestConsumer;
