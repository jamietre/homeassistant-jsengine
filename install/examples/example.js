"use strict";

const log = (...args) => JSEngine.log(__filename, ...args);

module.exports = {
	started: function () {
		log(`services:`, Object.keys(JSEngine.Services).sort().join(', '));
		log(`entities:`, Object.keys(JSEngine.Entities).sort().join(', '));
		log(`current user:`, JSEngine.CurrentUser);

		log(JSEngine.Entities['light.my_light_entity']);
		log(JSEngine.Services.light);

		JSEngine.Entities['light.my_light_entity'].turn_on( { "brightness_pct": 100, "rgb_color": [255,128,255], "transition": 2 } );
	},

};

