# Security Policy

## Supported versions

Security fixes are applied on the `main` branch of this repository.

## Threat model

This app is designed for a **trusted host** (a family party on a LAN, or a single operator). The HTTP API is **not authenticated** beyond an optional host PIN and join code:

- Anyone who can reach `/api` and knows the join code can sit as a player or open the spectator board.
- Anyone who can claim host (open desk, or the `HOST_PIN`) can start the night, veto moves, toggle clerk, and reset the table. Wrapped gift labels stay Wrapped even with clerk open.
- Gift contributions stay off the public roster until unwrap, but they are stored in server memory. Anyone who can dump process memory can read them.

Do **not** expose a live party instance to the public internet without putting it behind your own auth (VPN, reverse-proxy basic auth, SSO, etc.).

Museum / demo mode (`MUSEUM_MODE=true`) seeds a fake roster, shows a banner, and sends `X-Robots-Tag: noindex`. It is still a writable sandbox.

## Reporting a vulnerability

Please email **hello@fullstackboston.com** with:

- A short description of the issue
- Steps to reproduce
- Impact (data exposure, table takeover, etc.)

Do not open a public GitHub issue for sensitive reports. We will acknowledge receipt within a few business days.
