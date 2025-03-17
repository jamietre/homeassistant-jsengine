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

## Basic install

The engine is meant to be used as a Linux service, but can be run directly from commandline.

Please refer to the below instructions for [running as a service](https://github.com/puzzle-star/homeassistant-jsengine/tree/master?tab=readme-ov-file#installing-as-a-service-systemd) once the basic install is complete.

### Create the Access Token

Please refer to [how to create an access token](https://developers.home-assistant.io/docs/auth_api/#long-lived-access-token) in Home Assistant documentation. You can also create one from the UI, under the `User Profile` page, `Security` tab:

![image](https://github.com/user-attachments/assets/e1c0a3f6-f2aa-45ba-ba80-48d04176ef41)

### Install and Test
```
mkdir -p /opt/homeassistant/homeassistant-jsengine/
cd /opt/homeassistant/homeassistant-jsengine/
npm install homeassistant-jsengine
echo 'HASS_TOKEN="[your HASS access token - create one for the hass user you want the scripts to run as]"' >hass-token.env
mkdir -p scripts

source ./hass-token.env && export HASS_TOKEN && nodejs node_modules/homeassistant-jsengine/jsengine.js node_modules/homeassistant-jsengine/install/examples
```

### Running from the command-line
```
source ./hass-token.env && export HASS_TOKEN && nodejs node_modules/homeassistant-jsengine/jsengine.js scripts
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

## Usage: 

### Scripts Location

By default, in `[install-path]/scripts`. They will be executed automatically and reloaded if modified.

### API available to scripts

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

**Wildcard events:** called based entity-id and states basic matching. Matches can use wildcards (*) in all or part of the pattern. Braces `{}` around patterns are mandatory.
- __module-{__ _script-name_ __}-loaded__ (name, module)
- __module-{__ _script-name_ __}-unloaded__ (name, module)
- __entity-{__ _entity-id_ __}-added__ (id, entity)
- __entity-{__ _entity-id_ __}-removed__ (id, entity)
- __entity-{__ _entity-id_ __}-updated__ (id, state, changed, old_state, entity, old_entity)
- __entity-{__ _entity-id_ __}-state-changed__ (id, state, old_state, entity, old_entity)
- __entity-{__ _entity-id_ __}-state-changed-to-{__ _state_ __}__ (id, state, old_state, entity, old_entity)
- __entity-{__ _entity-id_ __}-state-changed-from-{__ _state_ __}-to-{__ _state_ __}__ (id, state, old_state, entity, old_entity)

**Accessing the global `JSEngine` object:**
```
log(`entities:`, Object.keys(JSEngine.Entities).sort().join(', '));
log(`services:`, Object.keys(JSEngine.Services).sort().join(', '));`
log(`current user:`, JSEngine.CurrentUser);
```

**Acessing a single `entity` object:**
```
log(JSEngine.Entities['my_light_entity']);

(example) Entity {
  id: 'my_light_entity',
  domain: 'light',
  name: 'My Light Entity',
  groups: { ... },
  entity_id: 'light.my_light_entity', <-- just the same as 'id'
  state: 'on',
  attributes: {
    supported_color_modes: [ 'color_temp', 'xy' ],
    min_color_temp_kelvin: 2202,
    max_color_temp_kelvin: 4000,
    color_mode: 'color_temp',
    brightness: 255,
    color_temp_kelvin: 3717,
    color_temp: 269,
    hs_color: [ 26.983, 40.252 ],
    rgb_color: [ 255, 198, 152 ],
    xy_color: [ 0.439, 0.37 ],
    ...
  },
  last_changed: '...',
  last_updated: '...',
  turn_on: [Function: turn_on],
  turn_off: [Function: turn_off],
  toggle: [Function: toggle]
}
```

**Invoking `entity` object actions:**
```
JSEngine.Entities['light.my_light_entity'].turn_off();
JSEngine.Entities['light.my_light_entity'].turn_on();
JSEngine.Entities['light.my_light_entity'].toggle();

JSEngine.Entities['light.my_light_entity'].turn_on( { "brightness_pct": 100, "rgb_color": [255,128,255], "transition": 2 } );
```

## Installing as a service (systemd)

Edit the systemd service file `install/homeassistant-jsengine.service` to adapt it to your installed system username path. The provided one assumes installatation in `/opt/homeassistant/homeassistant-jsengine` under user `homeassistant`, and install it.

Please remember to update the [authentication token](https://developers.home-assistant.io/docs/auth_api/#long-lived-access-token) as per [basic install instructions](https://github.com/puzzle-star/homeassistant-jsengine/tree/master?tab=readme-ov-file#basic-install).

### Edit

```
[Unit]
Description=Home Assistant JS Engine
After=network-online.target
Requires=homeassistant.service
#StartLimitIntervalSec=60
#StartLimitBurst=5
StartLimitIntervalSec=0

[Service]
Type=simple
User=homeassistant
WorkingDirectory=/opt/homeassistant/homeassistant-jsengine
EnvironmentFile=/opt/homeassistant/homeassistant-jsengine/hass-token.env
ExecStart=/usr/bin/nodejs jsengine.js scripts
Restart=always
RestartSec=10
StandardOutput=append:/var/log/homeassistant-jsengine.log
StandardError=inherit

[Install]
WantedBy=multi-user.target
```

### Run
```
cp -av install/homeassistant-jsengine.service /usr/local/lib/systemd/system/
systemctl daemon-reload
systemctl enable homeassistant-jsengine
systemctl start homeassistant-jsengine
```




