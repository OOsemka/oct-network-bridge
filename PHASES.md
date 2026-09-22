# oct-network-bridge — Implementation Phases

- [x] Phase 1: Scaffold (package.json, webpack, Containerfile, nginx, console-extensions, deploy/, .cursor/rules, AGENTS.md, README)
- [x] Phase 2: K8s models (NNS, NNCP, NNCE, MCP models in k8s-resources.ts)
- [x] Phase 3: NIC discovery (read NNS, group by MCP, detect existing bridges)
- [x] Phase 4: Bridge form UI (bridge type toggle, port selector, VLAN tag option, bridge options, name, IP config, node selector)
- [x] Phase 5: NNCP generation (linux-bridge and ovs-bridge YAML builders with OVN bridge-mappings)
- [x] Phase 6: Apply + status polling (create NNCP, poll NNCE, progress display)
- [x] Phase 7: Bridge inventory + remove (list existing, remove flow with absent + delete)
- [x] Phase 8: i18n (all user-facing strings)
- [ ] Phase 9: Build + push images (1.0.0-ocp4.22, 1.0.0-ocp4.21)
- [ ] Phase 10: Storefront integration (icon, tile, deploy bundle, BUNDLED_DEPLOY, validate)
