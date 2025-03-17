"use strict";

const log = (...args) => JSEngine.log(__filename, ...args);

module.exports = {
	started: function () {
		log(`services:`, Object.keys(JSEngine.Services).sort().join(', '));
		log(`entities:`, Object.keys(JSEngine.Entities).sort().join(', '));
		log(`current user:`, JSEngine.CurrentUser);

		log(JSEngine.Entities['my_light_entity']);
		log(JSEngine.Services.light);
	},

};

