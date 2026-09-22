# Network Bridge (OpenShift Community Tools)

**Community project. Not officially supported by Red Hat.**

Standalone OpenShift Console plugin that creates linux-bridge and ovs-bridge interfaces on cluster nodes using NMState NodeNetworkConfigurationPolicy.

Deleting a policy does **not** remove a live bridge. **Remove** applies `state: absent` first, waits for NMState, then deletes the policy. The bridge that carries `br-ex` (cluster default network) cannot be removed.

- **Plugin ID:** `oct-network-bridge`
- **Version:** `1.0.0`
- **Image:** `quay.io/cjanisze/oct-network-bridge:1.0.0-ocp4.22` and `:1.0.0-ocp4.21` (`<semver>-ocp<major.minor>`; always publish both minors)

Validated on OpenShift **4.22** (PatternFly 6). Open from **Community Tools → Network** after the storefront (`oct-storefront`) and this plugin are enabled.

## Supported bridge types

| Type | Description |
| --- | --- |
| Linux Bridge | Standard kernel bridge. Options: STP. |
| OVS Bridge | Open vSwitch bridge. Options: STP, Multicast Snooping, Allow Extra Patch Ports. Requires OVN bridge-mappings. |

Features:
- **MachineConfigPool targeting:** MCPs fingerprinted by physical NIC names. Only MCPs with identical NIC sets can be combined.
- **VLAN tagging:** Optional VLAN sub-interface created before the bridge.
- **OVN bridge-mappings:** Configurable localnet-to-bridge mappings for OVS bridges.
- **Bridge inventory:** View existing linux-bridge and ovs-bridge interfaces with remove support.

## Navigation

Uses `useNavigate` from `react-router-dom-v5-compat` (React Router v6 bridge). Route: `/community-tools/network/bridge`.

```bash
yarn install
yarn build
```

Deploy: edit the image in `deploy/install.yaml`, `oc apply -f deploy/install.yaml` (only when asked), then enable `oct-network-bridge` in `consoles.operator.openshift.io/cluster` `spec.plugins` (or use the storefront **Add** action).

## Contributing — cluster-portable code

Do **not** hardcode environment-specific values (VLAN IDs, CIDRs, lab bridge names, StorageClasses, hostnames). The UI reads live NMState; the user supplies the bridge config. Agents: `.cursor/rules/oct-no-env-hardcoding.mdc`.
