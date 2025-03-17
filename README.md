# Home Assistant JS Engine
This is an external engine that exposes Home Assistant entities and services to JavaScript scripts. It works by connecting to HASS WebSocket API, and encapsulates all available entitities as JS objects to be able to simply interact with them using JavaScript.

Scripts are constantly monitored in the `scripts` directory. They will be loaded when the service is started, reloaded when modified, and unloaded when deleted (also before reload).

JSON files will also be monitored and (re)loaded automatically. Scripts are notified when this happens. This provides a way to configure the scripts (and change their configuration on-the-fly), if your scripts want to support this.

**This is not a homeassistant offical integration.**

## Why
If you are used to JavaScript and do not want to go through the learning curve of Python and YAML templates (or just prefer JS for your automations), this comes to be a very handy tool that adds the capability to use JavaScript for your more complex automations, that may not be easily (or possible at all) implemented using templates.

After waiting for a propoer JS integration and seeing that attempts where stalled for a long time, I decided to run my own one.

## Status
It's been working since 2022 for my automations. It is still under heavy development and plan to add more capabilities provided by the WebSocket API.

There is still some code cleanup pending, and several to-dos, but it is in a totally working state.

## Usage
It is meant to be used as a Linux service, but can be run directly from commandline:

**Install and testing:** (see below for creating an access token and running as a service)
```
npm install
echo 'HASS_TOKEN="[your HASS access token - create one for the hass user you want the scripts to run as]"' >hass-token.env
npm test
```

**Run:** (see below for installing as a service)
```
source hass-token.env && export HASS_TOKEN && nodejs jsengine scripts
```

**Output:**
```
(jsengine) Loaded: /opt/git/homeassistant-jsengine/examples/test.js
(test) module /opt/git/homeassistant-jsengine/examples/test.js: loaded
(jsengine) Connected to Home Assistant as ...
(test) started
(test) current user: ...
(test) light.home_office: off -> on
(test) light.home_office_light_2_2: off -> on
(test) light.home_office_light_1_1: off -> on
(test) light.home_office_light_2_1: off -> on
(test) light.home_office_light_1_2: off -> on
(test) light.home_office: on
(test) sensor.inverter_battery_capacity: ...
^C
[2025-03-17 08:34:48.382] (jsengine) Unloaded: /opt/git/homeassistant-jsengine/examples/test.js
[2025-03-17 08:34:48.382] (test) stopped
```

## API available to scripts

See the `test.js` script in examples directory for reference

**Exposed events:** called automatically when a matching event happens

- **started:** called when the script is loaded **and** the service is connected to HASS
- **stopped:** called when the script is unloaded **or** the service is disconnected from HASS
- **module-loaded** (name, module): called when a new script file is loaded
- **module-unloaded** (name, module): called when a script file is unloaded
- **entity-added** (id, entity): called when an entity is added
- **entity-removed** (id, entity): called when an entity is removed
- **entity-updated** (id, state, changed, old_state, entity, old_entity): called when an entity receives an update (either state or attributes changed)
- **entity-state-changed** (id, state, old_state, entity, old_entity): called when an entity state changes

**Wildcard events:** called based entity-id and states basic matching. Matches can use wildcards (*) in all or part of pattern. Braces `{}` around patterns are mandatory.
- __module-{__ _script-name_ __}-loaded__ (name, module)
- __module-{__ _script-name_ __}-unloaded__ (name, module)
- __entity-{__ _entity-id_ __}-added__ (id, entity)
- __entity-{__ _entity-id_ __}-removed__ (id, entity)
- __entity-{__ _entity-id_ __}-updated__ (id, state, changed, old_state, entity, old_entity)
- __entity-{__ _entity-id_ __}-state-changed__ (id, state, old_state, entity, old_entity)
- __entity-{__ _entity-id_ __}-state-changed-to-{__ _state_ __}__ (id, state, old_state, entity, old_entity)
- __entity-{__ _entity-id_ __}-state-changed-from-{__ _state_ __}-to-{__ _state_ __}__ (id, state, old_state, entity, old_entity)


