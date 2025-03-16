"use strict";

const process = require('process');
const path = require('path');
const RunDir = new require('jsrundir');

globalThis.WebSocket = require('ws');

const __log = (file, ...args) => {
	const stamp = new Date().toISOString().replace('T', ' ').replace('Z', '');
	const name = file.replace(/^(.*[\\\/])?([^\\\/]+)\.js$/i, '$2');
	console.log(`[${stamp}] (${name})`, ...args);
};

const log = (...args) => {
	if (require.main === module) {
		__log(__filename, ...args);
	}
}

const debug = (...args) => {
	// __log(__filename, ...args);
}

const info = (...args) => {
	__log(__filename, ...args);
}

const error = (...args) => {
	__log(__filename, ...args);
}

const match = (pattern, str) => {
	return new RegExp('^' + pattern.split('*').map((str) => str.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, '\\$1')).join('.*') + '$').test(str);
}

class HA {
	connection = null;
	handlers = {};
	events = Promise.resolve();

	constructor(token, url) {
		this.api = require('home-assistant-js-websocket');
		this.token  = token;
		this.url = url;
	}

	notify(event, ...args) {
		const handlers = this.handlers[event];
		if (!handlers) return;

		for (const handler of handlers) {
			this.events = this.events.then(() => {
				return handler(...args);
			}).catch((e) => {
				error(e);
			});
/*
			Promise.resolve(handler(...args)).catch((e) => {
				error(e);
			});
*/
		}
	}

	onConnectionReady() {
		return this.notify('connection-ready');
	}

	onConnectionDisconnected() {
		return this.notify('connection-disconnected');
	}

	onConnectionReconnectError() {
		return this.notify('connection-reconnect-error');
	}

	onServicesUpdated(services) {
		return this.notify('services-updated', services);
	}

	onEntitiesUpdated(entities) {
		return this.notify('entities-updated', entities);
	}

/*
	collectPanels() {
		const panelRegistered = (state, event) => {
			log('Panel registered:', state, event);
  			// Returning null means no change.
  			if (state === undefined) return null;

  			// This will be merged with the existing state.
  			return {
    				panels: state.panels.concat(event.data.panel),
			};
		}

		const fetchPanels = () => this.connection.sendMessagePromise({ type: 'get_panels' });
		const subscribeUpdates = (conn, store) => { return conn.subscribeEvents(store.action(panelRegistered), 'panel_registered'); };
		const panelsColl = this.api.getCollection(this.connection, '_pnl', fetchPanels, subscribeUpdates);

		// Now use collection
		panelsColl.refresh().then(() => log('Panel refresh:', panelsColl.state));
		panelsColl.subscribe((panels) => console.log('Panel update:', panels));
	}
*/
	subscribeEvent(callback, event_type) {
		return this.connection.subscribeEvents((event) => callback(event));
	}

	subscribeMqtt(callback, topic = '#') {
		return this.connection.subscribeMessage((event) => callback(topic, event), {
    			type: 'subscribe_trigger',
    			trigger: {
				platform: 'mqtt',
				topic,
				// payload: "on",
 				// encoding: "utf-8",
			}
		});
	}

	subscribeWebhook(callback, webhook_id, local_only = true) {
		if (webhook_id === undefined) {
			return Promise.reject(new Error('Webhook id required'));
		}

		return this.connection.subscribeMessage((event) => callback(webhook_id, event), {
    			type: 'subscribe_trigger',
    			trigger: {
				platform: 'webhook',
				allowed_methods: 'POST',
				webhook_id,
				local_only,
			}
		});
	}

	connect() {
		const auth = this.api.createLongLivedTokenAuth(this.url, this.token);

		return this.api.createConnection({ auth }).then((connection) => {
			this.connection = connection;

			connection.addEventListener('ready', () => this.onConnectionReady());
			connection.addEventListener('disconnected', () => this.onConnectionDisconnected());
			connection.addEventListener('reconnect-error', () => this.onConnectionReconnectError());
			
			this.api.subscribeServices(connection, (services) => this.onServicesUpdated(services));
			this.api.subscribeEntities(connection, (entities) => this.onEntitiesUpdated(entities));

			// this.subscribeEvent((event) => log('Event:', event));
			// this.subscribeMqtt((...triggered) => log('MQTT:', ...triggered)).catch((e) => error(e));
			// this.subscribeWebhook((...triggered) => log('Webhook:', ...triggered), 'test').catch((e) => error(e));
			// this.collectPanels();

			return this.onConnectionReady();
		}).catch((e) => {
			error(`Error connecting to Home Assistant WebSocket backend: ${e}`);
			return Promise.reject(e);
		});
	}

	connected() {
		return this.connection && this.connection.conected();
	}

	getCurrentUser() {
		return this.api.getUser(this.connection);
	}

	callService(domain, service, data, target) {
		return this.api.callService(this.connection, domain, service, data, target).catch((e) => {
			error('Service error: ', e);
			return Promise.reject(e);
		});
	}

	stop() {
		return Promise.resolve(this.connection?.close());
	}

	on(event, handler) {
		if (!this.handlers[event]) this.handlers[event] = [];
		this.handlers[event].push(handler);
	}
}

function ImmutableProxy(object) {
	if (typeof object !== 'object' && typeof object !== 'function') {
		throw new TypeError(`Cannot create proxy for non-object`);
	}

	const proxies = {};

	const proxy = (object, property) => {
		const value = object[property];

		if (typeof value !== 'object' && typeof value !== 'function') { // TO DO: or value is already an immutable proxy
			return value;
		}
	
		const cached = proxies[property];
		if (cached !== undefined && cached.target === value) {
			return cached.proxy;
		}

		const proxy = ImmutableProxy(value);
		proxies[property] = {
			target: value,
			proxy: proxy,
		};

		return proxy;
	};

	return new Proxy(object, {
		get: (target, property) => {
			return proxy(target, property);
		},

		getOwnPropertyDescriptor: (target, property) => {
			// if (property === 'constructor') return undefined;
			if (!target.hasOwnProperty(property)) return undefined;

			const descriptor = Object.getOwnPropertyDescriptor(target, property);

			return Object.assign(descriptor, {
				value: proxy(target, property),
				// writable: false,
			});
		},

		set: (target, property, value) => {
			throw new TypeError(`Cannot set property of read-only object: ${target.constructor.name}.${property}`);
		},
	
		defineProperty: (target, property, descriptor) => {
			throw new TypeError(`Cannot add properties to read-only object: ${target.constructor.name}.${property}`);
		},
	
		deleteProperty: (target, property) => {
			throw new TypeError(`Cannot delete property of read-only object: ${target.constructor.name}.${property}`);
		},

		preventExtensions: (target) => {
			return true;
		},

		apply: (method, target, args) => {
			return method.bind(target)(...args);
		},
	});
}

module.exports = class JSEngine {
	#dir = null;
	#rundir = null;
	#ha = null;

	#scripts = [];
	#modules = {};
	#queue = {};

	#cached = new class {
		// #targets = [];
		#pending = 0;
		#assigned = {};

		#empty(object) {
			for (const property in object) {
				if (object.hasOwnProperty(property)) delete object[property];
			}
		}

		ready() {
			return !this.#pending;
		}

		empty(target) {
			if (this.#assigned[target] === undefined) throw new Error(`Not cached: ${target}`);

			this.#empty(this[target]);

			if (!this.#assigned[target]) {
				this.#assigned[target] = true;
				this.#pending--;
			}
		}

		add(target) {
			if (this.#assigned[target] !== undefined) throw new Error(`Already cached: ${target}`);

			const cached = {};

			this[target] = cached;
			this.#assigned[target] = false;
			this.#pending++;

			return cached;
		}

		reset() {
			for (const target in this.#assigned) {
				if (this.#assigned[target]) {
					this.#empty(this[target]);
					this.#assigned[target] = false;
					this.#pending++;
				}
			}
		}

		assign(target, data) {
			if (this.#assigned[target] === undefined) throw new Error(`Not cached: ${target}`);

			const assigned = this.#assigned[target];
			const cached = this[target];

			if (this.#assigned[target]) {
				this.#empty(cached);
			}
			else {
				this.#assigned[target] = true;
				this.#pending--;
			}

			Object.assign(cached, data);
		}
	};

	#ready = false;
	#currentUser = ImmutableProxy(this.#cached.add('currentUser'));
	#services = ImmutableProxy(this.#cached.add('services'));
	#entities = ImmutableProxy(this.#cached.add('entities'));
	#groups = {};

	static Service = class Service {
		#name;

		constructor(name, data, api) {
			this.#name = name;

			for (const action in data) {
				const service = data[action];
				// const domain = service.target?.entity?.find((check) => check.domain && check.domain.indexOf(name) >= 0);

				let named;

				if (!service.target?.entity) {
					named = {
						[action](data = {}) {
							return api.callService(name, action, args);
						}
					}
				}
				else {
					named = {
						[action](entity_id, data = {}) {
							return api.callService(name, action, data, { entity_id });
						}
					}
					named[action].domain = Object.fromEntries(service.target.entity.map((entity) => [entity.domain ? entity.domain : null, entity]));
				}

				const handler = named[action];

				handler.action = service.name;
				handler.description = service.description;
				handler.fields = service.fields;
				handler.target = service.target;

				this[action] = handler;
			}
		}

		get name() {
			return this.#name;
		}
	};

	static Entity = class Entity {
		id;
		domain;

		constructor(id) {
			this.id = id;
			this.domain = id.substring(0, id.indexOf('.'));
		}

		update(data) {
			Object.assign(this, data);

			for (const property in data) {
				if (data[property] === undefined) {
					delete this[property];
				}
			}
		}

		clone() {
			return Object.assign({}, this);
		}

		proxiedServices(services) {
			const actions = () => {
				// TO DO: filter supported features
				if (!services[this.domain]) return {};
				
				return Object.fromEntries(Object.entries(services[this.domain]).filter(([name, action]) => action.domain?.[this.domain]));
			};

			const action = (name) => {
				// TO DO: filter supported features 
				const handler = services[this.domain]?.[name]
				if (!handler?.domain?.[this.domain]) return undefined;

				const named = {
					[name]: (...args) => handler(this.id, ...args)
				};

				return named[name];
			};

			return new Proxy(this, {
				get: (target, property) => {
					if (property == 'proxiedServices') {
						return undefined;
					}

					if (target[property] !== undefined) {
						return target[property];
					}

					return action(property);
				},

				ownKeys: (target) => {
					return Object.keys(target).filter((property) => property != 'proxiedServices').concat(Object.keys(actions()));
				},

				has: (target, property) => {
					return property == 'proxiedServices' ? false : target.hasOwnProperty(property) || action(property);
				},

				getOwnPropertyDescriptor: (target, property) => {
					if (property == 'proxiedServices') {
						return undefined;
					}

					if (target.hasOwnProperty(property)) {
						return Object.getOwnPropertyDescriptor(target, property);
					}

					const handler = action(property);
					if (handler) {
						return {
							value: action(property),
							writable: false,
							configurable: true,
							enumerable: true,
						};
					}
				},
			});
		}
	};

	#engine;

	constructor(dir, token, url = 'http://127.0.0.1:8123') {
		this.#dir = dir;
		this.#rundir = new RunDir(this.#dir);
		this.#rundir.on('load', (name, module) => this.#scriptLoaded(name, module));
		this.#rundir.on('unload', (name, module) => this.#scriptUnloaded(name, module));

		this.#ha = new HA(token, url);
		this.#ha.on('connection-ready', () => this.#connectionReady());
		this.#ha.on('connection-disconnected', () => this.#connectionDisconnected());
		this.#ha.on('connection-reconnect-error', () => this.#connectionReconnectError());
		this.#ha.on('services-updated', (services) => this.#servicesUpdated(services));
		this.#ha.on('entities-updated', (entities) => this.#entitiesUpdated(entities));

		const self = this;

		this.#engine = ImmutableProxy({
			get CurrentUser() {
				return self.#currentUser;
			},

			get Services() {
				return self.#services;
			},

			get Entities() {
				return self.#entities;
			},

			get started() {
				return self.#ready;
			},

			log: (name, ...args) => {
				return __log(name, ...args);
			}
		});

		if (globalThis.JSEngine === undefined) {
			globalThis.JSEngine = this.#engine;
		}
	}

	#reset() {
		this.#ready = false;
		this.#cached.reset();
	}

	#notify(script, event, ...args) {
		const module = this.#modules[script];
		if (typeof module !== 'object') return Promise.resolve();

		const handler = module[event];
		if (!handler) return Promise.resolve();

		return this.#queue[script] = this.#queue[script].then(() => {
			return handler(...args);
		}).catch((e) => {
			error(e);
		});
	}

	#notifyMatch(script, events, ...args) {
		let queue = Promise.resolve();

		for (const handler of Object.keys(this.#modules[script])) {
			for (const event of Array.isArray(events) ? events : [ events ]) {
				if (match(handler, event)) {
					queue = queue.then(() => this.#notify(script, handler, ...args));
					break;
				}
			}
		}

		return queue;
	}

	#notifyAll(event, ...args) {
		const batch = [];

		for (const script of this.#scripts) {
			batch.push(this.#notify(script, event, ...args));
		}

		return Promise.all(batch);

	}

	#notifyAllMatch(events, ...args) {
		const batch = [];

		for (const script of this.#scripts) {
			batch.push(this.#notifyMatch(script, events, ...args));
		}

		return Promise.all(batch);
	}

	#updateConnection() {
		if (this.#ready || !this.#cached.ready()) return;

		info(`Connected to Home Assistant as ${this.#currentUser.name}`);
		this.#ready = true;

		return this.#notifyAll('started');
	}

	#connectionReady() {
		return this.#ha.getCurrentUser().then((user) => {
			this.#cached.assign('currentUser', user);
			return this.#updateConnection();
		});
	}

	#connectionDisconnected() {
		info('Disconnected from Home Assistant');
		this.#reset();
		return this.#notifyAll('stopped');
	}

	#connectionReconnectError() {
		info('Error reconnecting to Home Assistant');
		return this.#notifyAll('error');
	}

	#servicesUpdated(services) {
		this.#cached.empty('services');
		for(const service in services) {
			this.#cached.services[service] = new JSEngine.Service(service, services[service], this.#ha);
		}

		return this.#updateConnection();
	}

	#entity(id, data) {
		const entity = this.#cached.entities[id] || (this.#cached.entities[id] = new JSEngine.Entity(id).proxiedServices(this.#cached.services));

		const merged = {};

		if (data) {
			Object.assign(merged, structuredClone(data));
			merged.name = data.attributes?.friendly_name;
			merged.members = data.attributes?.entity_id ? {} : undefined;

			if (entity.attributes?.entity_id) {
				for (const member_id of entity.attributes.entity_id) {
					const member_entity = this.#cached.entities[member_id];
	
					if (member_entity?.groups?.[id]) {
						delete member_entity.groups[id];
					}
				}
			}

			if (data.attributes?.entity_id) {
				for (const member_id of data.attributes.entity_id) {
					const member_entity = this.#entity(member_id);
	
					merged.members[member_id] = member_entity;
					member_entity.groups[id] = entity;
				}
			}

		}

		merged.groups = entity.groups || {};

		entity.update(merged); // TO DO: remove 'undefined' properties in entity.update()

		return entity;
	}

	#entitiesUpdated(entities) {
		debug('entities updated');

		if (!this.#ready) {
			this.#cached.empty('entities');
			for(const entity in entities) {
				this.#entity(entity, entities[entity]);
			}

			return this.#updateConnection();
		}

		let queue = Promise.resolve();

		for (const entity of Object.values(this.#cached.entities)) {
			const id = entity.id;
			if (entities[id]) continue;

			queue = queue.then(() => {
				debug(`${id}: [removed]`);

				// TO DO: remove group from members

				delete this.#cached.entities[id];

				return this.#notifyAllMatch([
					'entity-removed',
					`entity-{${id}}-removed`
				], id, entity);
			});
		}

		for (const entity of Object.values(entities).sort((a, b) => a.last_updated == b.last_updated ? 0 : (a.last_updated < b.last_updated ? -1 : 1))) {
			const id = entity.entity_id;
			let current = this.#cached.entities[id];

			if (current && entity.last_updated <= current.last_updated) {
				continue;
			}

			const previous = current ? ImmutableProxy(current.clone()) : undefined; // TO DO: members and groups
			const changed = !previous || entity.last_changed > previous.last_changed;
			const old_state = previous?.state;

			queue = queue.then(() => {
				debug(`entity: ${id} -> ${entity.last_updated}`);

				current = this.#entity(id, entity);

				if (!previous) {
					debug(`${id}: [added]`);

					return this.#notifyAllMatch([
						'entity-added',
						`entity-{${id}}-added`
					], id, current);
				}
			}).then(() => {
				debug(`${id}: ${current.state}${changed ? ' [changed]' : ''}`);
			
				return this.#notifyAllMatch([
					'entity-updated',
					`entity-{${id}}-updated`
				], id, current.state, changed, old_state, current, previous);
			}).then(() => {
				if (changed) {
					debug(`${id}: ${old_state ? old_state : '()'} -> ${current.state}`);

					return this.#notifyAllMatch([
						'entity-state-changed', 
						`entity-{${id}}-state-changed`, 
						`entity-{${id}}-state-changed-to-{${current.state}}`, 
						`entity-{${id}}-state-changed-from-{${old_state}}-to-{${current.state}}`
					], id, current.state, old_state, current, previous);
				}
			});
		}

		return queue;
	}

	#scriptLoaded(name, module) {
		// TO DO: wait for pending notifications if previously unloaded (is this needed?)
		info(`Loaded: ${name}`);

		module.JSEngine = this.#engine;

		return this.#notifyAllMatch([
			'module-loaded',
			`module-{${name}}-loaded`
		], name, module).then(() => {
			this.#modules[name] = module;
			this.#scripts.push(name);
			// this.#queue[name] = [];
			this.#queue[name] = Promise.resolve();

			const batch = [];

			for (const script of this.#scripts) {
				batch.push(this.#notifyMatch(name, [
					'module-loaded',
					`module-{${script}}-loaded`
				], script, this.#modules[script]));
			}

			return Promise.all(batch);
		}).then(() => {
			if (this.#ready) {
				return this.#notify(name, 'started');
			}
		});

	}

	#scriptUnloaded(name, module) {
		// TO DO: wait for pending notifications (is this needed?)
		info(`Unloaded: ${name}`);

		return Promise.resolve().then(() => {
			if (this.#ready) {
				return this.#notify(name, 'stopped');
			}
		}).then(() => {
			module.JSEngine = null;

			delete this.#modules[name];
			this.#scripts.splice(this.#scripts.indexOf(name), 1);
			delete this.#queue[name];
		}).then(() => {
			return this.#notifyAllMatch([
				'module-unloaded',
				`module-{${name}}-unloaded`
			], name, module);
		});
	}

	start() {
		// TO DO: maybe rundir.run() should return a promise to indicate init completion
		this.#rundir.run();
		return this.#ha.connect();
	}

	stop() {
		// TO DO: maybe rundir.stop() should return a promise to indicate stop completion
		this.#ha.stop().then(() => {
			this.#rundir.stop();
		});
	}
}

if (require.main === module) {
	const process = require('process');
	const parameters = process.argv.slice(2);

	if (parameters.length != 1) process.exit(1);

	const dir = path.resolve(parameters[0]);
	const token = process.env.HASS_TOKEN;

	const ha = new module.exports(dir, token);

	const shutdown = () => {
		ha.stop();
		// process.exit(0);
	};

	process.on('SIGINT', shutdown);
	process.on('SIGTERM', shutdown);

	process.on('uncaughtException', error);

	ha.start().catch((e) => {
		error(e);
		shutdown();
	});
}
