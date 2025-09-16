import { Logger } from '../logger/logger';
import { HaEntity } from '../types/ha-types';
import { JsModule, JsModuleOptions } from '../types/jsmodule';

class TestConsumer implements JsModule {
    private logger: Logger;
    constructor(options: JsModuleOptions) {
        this.logger = options.loggerFactory({ source: 'TestConsumer' });
    }

    started() {
        this.logger.debug('Started');
    }
    stopped() {
        this.logger.debug('Stopped');
    }
    moduleLoaded(script: string) {
        this.logger.debug(`Loaded ${script}`);
    }
    entityAdded(id: string, entity: HaEntity) {
        this.logger.debug(`Added ${id}`);
    }
    entityRemoved(id: string, entity: HaEntity) {
        this.logger.debug(`Removed ${id}`);
    }
    entityUpdated(id: string, state: string, changed: boolean, entity: HaEntity, oldEntity: HaEntity) {
        this.logger.debug(`Updated ${id}`);
    }
    entityStateChanged(id: string, state: string, oldState: string, entity: HaEntity, oldEntity: HaEntity) {
        this.logger.debug(`State Changed ${id}`);
    }
}

export default TestConsumer;
