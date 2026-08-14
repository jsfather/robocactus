#!/bin/sh

set -eu

config_path=/usr/share/nginx/html/env.js
temporary_path="${config_path}.tmp"

printf 'window.__APP_CONFIG__ = ' > "${temporary_path}"
jq -n 'env | with_entries(select(.key | startswith("VITE_")))' >> "${temporary_path}"
printf ';\n' >> "${temporary_path}"
mv "${temporary_path}" "${config_path}"
