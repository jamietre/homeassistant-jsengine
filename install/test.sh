#!/bin/sh

. ./hass-token.env

[ -z "$HASS_TOKEN" ] && echo "Please add your authentication token to 'hass-token.env'" && exit 1

export HASS_TOKEN

nodejs jsengine examples

