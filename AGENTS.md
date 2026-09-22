# AGENTS.md — Network Bridge (OCT extension)

This is **OpenShift Community Tools (OCT)**, a **community project**, not an official Red Hat supported product. Do not describe it as official Red Hat software.

This repository is the **Network Bridge** ConsolePlugin: create linux-bridge and ovs-bridge interfaces on cluster nodes using NMState. It is **not** the OCT storefront. Catalog hubs live in `oct-storefront`. Network Bond lives in `oct-network-bond`. Bare Metal Hosts lives in `oct-baremetal`.

## Identifiers

| | Value |
| --- | --- |
| Plugin ID / ConsolePlugin / `package.json` `consolePlugin.name` | **`oct-network-bridge`** |
| Image | `quay.io/cjanisze/oct-network-bridge:1.0.0-ocp4.22` (`<semver>-ocp<major.minor>`) |
| i18n | `plugin__oct-network-bridge` |

Display name is **Network Bridge**. No PVC or discovery sidecar.

**Current version:** `1.0.0` (package.json / consolePlugin.version).

## Architecture (short)

| Piece | Role |
| --- | --- |
| Console dynamic plugin (`src/`, `console-extensions.json`) | Bridge route only. Kubernetes API via Console SDK. |
| Plugin nginx container (`Containerfile`, `deploy/`) | Serves webpack `dist/`. ConsolePlugin **oct-network-bridge**. |

## Exposed modules

| Module | Route | Description |
| --- | --- | --- |
| `NetworkBridgePage` | `/community-tools/network/bridge` | Single-page stacked-card form: MCP selection, existing bridge inventory, bridge type (Linux/OVS) toggle, port selection, VLAN tagging, bridge options, OVN bridge mappings, IPv4, review + create. |

## What this plugin creates

- NodeNetworkConfigurationPolicy (NNCP) resources for linux-bridge and ovs-bridge
- Optional VLAN sub-interfaces (e.g. `bond0.2112`) when VLAN tagging is enabled
- OVN bridge-mappings in desiredState for OVS bridges
- Labels: `app.kubernetes.io/managed-by: oct-network-bridge`

## Bridge types

| Type | NMState type | Description |
| --- | --- | --- |
| Linux Bridge | `linux-bridge` | Standard kernel bridge. Options: STP. |
| OVS Bridge | `ovs-bridge` | Open vSwitch bridge. Options: STP, Multicast Snooping, Allow Extra Patch Ports. Requires OVN bridge-mappings. |

## Bridge removal

Deleting a NodeNetworkConfigurationPolicy does **not** remove a live bridge. Remove sets the bridge to `state: absent` with NMState, waits for NNCE/NNCP SuccessfullyConfigured, then deletes the policy. **Never** absent the bridge that `br-ex` uses — that is the OVN default network and taking it absent bricks the node.

## MachineConfigPool targeting

MCPs are watched cluster-wide. `buildMcpNicGroups` fingerprints physical NIC names per pool (identical vs mixed NICs). UI checkboxes only allow combining MCPs with the same NIC fingerprint. `planNncpTargets`: one covering `nodeSelector` for compact/SNO overlap; one NNCP per MCP when disjoint; per-hostname selectors to avoid double-apply when MCPs overlap.

## OpenShift and extension versions

Two axes in the catalog: git tag **`v1.x.x`** (semver) and optional branch **`ocp-X.Y`** when PatternFly or APIs diverge. Image tags **always** `<semver>-ocp<major.minor>` (e.g. `1.0.0-ocp4.22`). Storefront Add installs the newest stable semver compatible with the cluster; Update is explicit; one ConsolePlugin name runs one version.

- Git: `main` tracks the newest supported minor (currently **4.22**). Optional `ocp-4.22`, `ocp-4.21`.
- Images: `oct-network-bridge:1.0.0-ocp4.22` and `:1.0.0-ocp4.21`. **Always publish both** OpenShift minor tags (same digest if bits match). Catalog `versions[].image` must be the combined tag.
- PatternFly 6 on 4.22; do not mix PF majors on one branch.

## Navigation (React Router v6 via v5-compat)

Uses `useNavigate` from `react-router-dom-v5-compat` (^6.30.0). Breadcrumb and "Back to Network" navigate to `/community-tools/network`. NNCP deep links use plain `href` to the console k8s resource path. Route registered at `/community-tools/network/bridge` via `console-extensions.json`.

This plugin **does not** register the Community Tools section or hubs. Open from the storefront Network hub.

## PatternFly 6

No PatternFly CSS imports. Prefix CSS `netbridge-`.

## No environment-specific hardcoding

Never bake in lab networks, StorageClasses, hostnames, or similar. Bridges, VLANs, and interfaces come from the user's form and live NMState — not from constants. See `.cursor/rules/oct-no-env-hardcoding.mdc`.

## Catalog tile

Storefront `catalog/community.yaml`: `metadata.name: oct-network-bridge`, `consolePlugin: oct-network-bridge`, `spec.href: /community-tools/network/bridge` (must match `console-extensions.json`), `spec.versions[]` with semver + `openshift` and a **public combined image tag that exists**.

## Add must go Ready

Storefront **Add** can succeed while the plugin never becomes Ready (**Open** 404s). Follow **oct-storefront** `docs/extension-standard.md`: catalog `versions[].image` must be the **combined** tag `<semver>-ocp<major.minor>`, **exist**, and be **public** (no pull secret); confirm the plugin Deployment is Running. This plugin has no PVC or discovery sidecar.

## Do-not-break list

Do **not** change unless you are deliberately migrating a live cluster:

- Route `/community-tools/network/bridge`
- Bridge create/remove and NMState proxy behavior
- Plugin ID `oct-network-bridge`

## Verify

```bash
yarn install
yarn build
```
