"use strict";

const log = (...args) => JSEngine.log(__filename, ...args);

module.exports = {
	jsrundir: {
		'--onLoad': () => console.log('loaded'),
		'--onUnload': () => console.log('unloaded'),
	},

	started: function () {
		log(`started`);
		log(`current user: ${JSEngine.CurrentUser.name}`);
		// log(`services:`, Object.keys(JSEngine.Services).sort().join(', '));
		// log(`entities:`, Object.keys(JSEngine.Entities).sort().join(', '));

		Object.values(JSEngine.Entities).filter((entity) => entity.domain == 'light' || entity.domain == 'switch').forEach((entity) => {
			// log(entity);
			// entity.toggle();
		});

		// log(JSEngine);
		// log(JSEngine.Services.light);
		// log(JSEngine.Entities['light.my_light_entity']);
	},

	stopped: function () {
		log(`stopped`);
	},

	'entity-added': function (id, entity) {
		log(`${id}: (added)`);
	},

	'entity-removed': function (id, entity) {
		log(`${id}: (removed)`);
	},

	'entity-updated': function (id, state, changed, old_state, entity, old_entity) {
		if (!changed) log(`${id}: ${state}${changed ? " (changed)" : ""}`);
	},

	'entity-state-changed': function (id, state, old_state, entity, old_entity) {
		log(`${id}: ${old_state ? old_state : "*"} -> ${state}`);
		// log(`${id}: ${old_state ? old_state : "*"} -> ${state}`, entity);
	},

	'--entity-{switch.*}-added': function (id, entity) {
		log(`<switch.*> ${id}: (added)`);
	},

	'--entity-{switch.*}-removed': function (id, entity) {
		log(`<switch.*> ${id}: (removed)`);
	},

	'--entity-{switch.*}-updated': function (id, state, changed, old_state, entity, old_entity) {
		log(`<switch.*> ${id}: ${state}${changed ? " (changed)" : ""}`);
	},

	'--entity-{switch.*}-state-changed': function (id, state, old_state, entity, old_entity) {
		log(`<switch.*> ${id}: ${old_state ? old_state : "*"} -> ${state}`);
	},

	'--entity-{switch.*}-state-changed-to-{off}': function (id, state, old_state, entity, old_entity) {
		log(`<switch.* -> on> ${id}: ${old_state ? old_state : "*"} -> ${state}`);
	},

	'--entity-{switch.*}-state-changed-from-{off}-to-{on}': function (id, state, old_state, entity, old_entity) {
		log(`<switch.* on -> off> ${id}: ${old_state ? old_state : "*"} -> ${state}`);
	},

	'module-loaded': function (name, module) {
		log(`module ${name}: loaded`);
	},

	'--module-{*}-loaded': function (name, module) {
		log(`module ${name}: loaded (match)`);
	},

	'module-unloaded': function (name, module) {
		log(`module ${name}: unloaded`);
	},

	'--module-{*}-unloaded': function (name, module) {
		log(`module ${name}: unloaded (match)`);
	}
};

