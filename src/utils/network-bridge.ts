/**
 * NIC discovery + NNCP generation for the Network Bridge tool.
 * Supports linux-bridge and ovs-bridge via NMState NodeNetworkConfigurationPolicy.
 */

/* ------------------------------------------------------------------ */
/*  Common types                                                       */
/* ------------------------------------------------------------------ */

export type NodeRole = 'control-plane' | 'worker' | 'other';

export type BridgeType = 'linux-bridge' | 'ovs-bridge';

export type Ipv4Mode = 'none' | 'dhcp' | 'static';

export type BridgeIpv4Config = {
  mode: Ipv4Mode;
  address?: string;
  prefixLength?: number;
  gateway?: string;
};

export type NodeKindLite = {
  metadata: {
    name: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
};

/* ------------------------------------------------------------------ */
/*  NMState interface types                                            */
/* ------------------------------------------------------------------ */

export type NmstateVlan = {
  'base-iface'?: string;
  id?: number;
};

export type NmstateBridgePort = {
  name?: string;
};

export type NmstateRoute = {
  destination?: string;
  'next-hop-address'?: string;
  'next-hop-interface'?: string;
  'table-id'?: number;
};

export type NmstateInterfaceStatus = {
  name?: string;
  type?: string;
  state?: string;
  'mac-address'?: string;
  mtu?: number;
  controller?: string;
  ethernet?: {
    speed?: number;
    'auto-negotiation'?: boolean;
    duplex?: string;
  };
  vlan?: NmstateVlan;
  bridge?: {
    port?: Array<NmstateBridgePort | string>;
    options?: Record<string, unknown>;
  };
  'link-aggregation'?: {
    mode?: string;
    port?: string[];
    options?: Record<string, unknown>;
  };
  ipv4?: {
    enabled?: boolean;
    dhcp?: boolean;
    address?: Array<{ ip?: string; 'prefix-length'?: number }>;
  };
  ipv6?: {
    enabled?: boolean;
    dhcp?: boolean;
  };
  ovs?: Record<string, unknown>;
};

export type NodeNetworkStateKind = {
  apiVersion?: string;
  kind?: string;
  metadata: {
    name: string;
    labels?: Record<string, string>;
  };
  status?: {
    currentState?: {
      interfaces?: NmstateInterfaceStatus[];
      routes?: {
        running?: NmstateRoute[];
        config?: NmstateRoute[];
      };
    };
  };
};

/* ------------------------------------------------------------------ */
/*  NNCP / NNCE types                                                  */
/* ------------------------------------------------------------------ */

export type K8sCondition = {
  type?: string;
  status?: string;
  reason?: string;
  message?: string;
  lastHeartbeatTime?: string;
  lastTransitionTime?: string;
};

export type NncpDesiredInterface = {
  name?: string;
  type?: string;
  state?: string;
  bridge?: {
    port?: Array<{ name?: string }>;
    options?: Record<string, unknown>;
  };
  vlan?: NmstateVlan;
  'link-aggregation'?: {
    port?: string[];
  };
};

export type NncpResource = {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    labels?: Record<string, string>;
  };
  spec: {
    nodeSelector: Record<string, string>;
    desiredState: Record<string, unknown>;
  };
};

export type NncpKind = {
  apiVersion?: string;
  kind?: string;
  metadata: {
    name: string;
    labels?: Record<string, string>;
    generation?: number;
    resourceVersion?: string;
    uid?: string;
  };
  spec?: {
    nodeSelector?: Record<string, string>;
    desiredState?: {
      interfaces?: NncpDesiredInterface[];
    };
  };
  status?: {
    conditions?: K8sCondition[];
  };
};

export type NnceKind = {
  apiVersion?: string;
  kind?: string;
  metadata: {
    name: string;
    labels?: Record<string, string>;
  };
  status?: {
    policyGeneration?: number;
    conditions?: K8sCondition[];
  };
};

/* ------------------------------------------------------------------ */
/*  MachineConfigPool types                                            */
/* ------------------------------------------------------------------ */

export type LabelSelector = {
  matchLabels?: Record<string, string>;
  matchExpressions?: Array<{
    key: string;
    operator: string;
    values?: string[];
  }>;
};

export type MachineConfigPoolKind = {
  apiVersion?: string;
  kind?: string;
  metadata: {
    name: string;
    labels?: Record<string, string>;
  };
  spec?: {
    paused?: boolean;
    machineConfigSelector?: LabelSelector;
    nodeSelector?: LabelSelector;
  };
  status?: {
    machineCount?: number;
    readyMachineCount?: number;
  };
};

/* ------------------------------------------------------------------ */
/*  Plan types                                                         */
/* ------------------------------------------------------------------ */

export type PlanMessage = {
  key: string;
  values?: Record<string, string>;
};

export type PhysicalNic = {
  id: string;
  nodeName: string;
  nodeRole: NodeRole;
  name: string;
  macAddress: string;
  state: string;
  speedMbps?: number;
  mtu?: number;
  controller?: string;
  type: string;
};

export type McpNicGroup = {
  mcpName: string;
  nodeSelector: Record<string, string>;
  nodeNames: string[];
  fingerprint: string;
  identical: boolean;
  mixed: boolean;
  missingNns: string[];
  noPhysicalNics: boolean;
};

export type LayoutNic = {
  name: string;
  speedMbps?: number;
  speedMixed: boolean;
  state: string;
  stateMixed: boolean;
  enslavedControllers: string[];
  enslavedNodeCount: number;
  targetNodeCount: number;
  type: string;
};

export type OvnBridgeMapping = {
  localnet: string;
  bridge: string;
};

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const EXCLUDED_TYPES = new Set([
  'loopback',
  'ovs-interface',
  'veth',
  'vlan',
  'vxlan',
  'geneve',
  'dummy',
  'mac-vlan',
  'macvlan',
  'mac-vtap',
  'tun',
  'tap',
  'vrf',
  'ipsec',
  'infiniband',
  'wifi',
]);

const EXCLUDED_NAME =
  /^(lo|veth|cali|flannel|cni|docker|tun|tap|geneve|ovn-|br-|vxlan|dummy|kube-|lxc|nodelocaldns|virbr)/i;

const LINUX_IFACE_NAME = /^[a-zA-Z][a-zA-Z0-9._-]{0,14}$/;
const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

export const NNCP_APPLY_TIMEOUT_MS = 300_000;
export const NNCP_APPLY_POLL_MS = 3_000;

export const BRIDGE_TOOL_MANAGED_BY = new Set([
  'oct-network-bridge',
]);

export const BRIDGE_TOOL_NAME_LABEL = 'network-bridge';

/* ------------------------------------------------------------------ */
/*  Error helpers                                                      */
/* ------------------------------------------------------------------ */

export function getK8sErrorMessage(err: unknown): string {
  if (!err) return '';
  if (typeof err === 'string') return err;
  const obj = err as {
    message?: string;
    json?: { message?: string; code?: number };
    status?: number;
  };
  return obj.json?.message || obj.message || String(err);
}

export function getK8sErrorCode(err: unknown): number | undefined {
  const obj = err as { json?: { code?: number }; status?: number; code?: number };
  return obj.json?.code ?? obj.status ?? obj.code;
}

export function isMissingCrdError(err: unknown): boolean {
  const code = getK8sErrorCode(err);
  if (code === 404) return true;
  const msg = getK8sErrorMessage(err).toLowerCase();
  return (
    msg.includes('could not find the requested resource') ||
    msg.includes('no matches for kind') ||
    (msg.includes('nodenetworkstate') && msg.includes('not found'))
  );
}

export function isForbiddenError(err: unknown): boolean {
  const code = getK8sErrorCode(err);
  if (code === 403) return true;
  const msg = getK8sErrorMessage(err).toLowerCase();
  return msg.includes('forbidden') || msg.includes('cannot list resource');
}

/* ------------------------------------------------------------------ */
/*  Node helpers                                                       */
/* ------------------------------------------------------------------ */

export function nodeRoleFromLabels(labels?: Record<string, string>): NodeRole {
  if (!labels) return 'other';
  if (
    'node-role.kubernetes.io/control-plane' in labels ||
    'node-role.kubernetes.io/master' in labels
  ) {
    return 'control-plane';
  }
  if ('node-role.kubernetes.io/worker' in labels) return 'worker';
  return 'other';
}

export function formatSpeed(mbps?: number): string {
  if (mbps === undefined || mbps <= 0) return '—';
  if (mbps >= 1000) return `${mbps / 1000} Gbps`;
  return `${mbps} Mbps`;
}

/* ------------------------------------------------------------------ */
/*  Selector matchers                                                  */
/* ------------------------------------------------------------------ */

export function nodeMatchesSelector(
  labels: Record<string, string> | undefined,
  selector?: LabelSelector,
): boolean {
  if (!selector) return false;
  const nodeLabels = labels || {};
  const matchLabels = selector.matchLabels || {};
  const exprs = selector.matchExpressions || [];
  if (Object.keys(matchLabels).length === 0 && exprs.length === 0) return false;

  for (const [key, value] of Object.entries(matchLabels)) {
    if (nodeLabels[key] !== value) return false;
  }

  for (const expr of exprs) {
    const present = Object.prototype.hasOwnProperty.call(nodeLabels, expr.key);
    const val = nodeLabels[expr.key];
    const values = expr.values || [];
    switch (expr.operator) {
      case 'In':
        if (!present || !values.includes(val)) return false;
        break;
      case 'NotIn':
        if (present && values.includes(val)) return false;
        break;
      case 'Exists':
        if (!present) return false;
        break;
      case 'DoesNotExist':
        if (present) return false;
        break;
      default:
        return false;
    }
  }
  return true;
}

export function nodeMatchesNncpSelector(
  labels: Record<string, string> | undefined,
  nodeSelector?: Record<string, string>,
): boolean {
  if (!nodeSelector || Object.keys(nodeSelector).length === 0) return true;
  return nodeMatchesSelector(labels, { matchLabels: nodeSelector });
}

export function nodesForMcp(mcp: MachineConfigPoolKind, nodes: NodeKindLite[]): NodeKindLite[] {
  return nodes.filter((n) => nodeMatchesSelector(n.metadata.labels, mcp.spec?.nodeSelector));
}

/* ------------------------------------------------------------------ */
/*  NIC discovery                                                      */
/* ------------------------------------------------------------------ */

function isPhysicalOrBond(iface: NmstateInterfaceStatus): boolean {
  const name = iface.name || '';
  if (!name || EXCLUDED_NAME.test(name)) return false;
  const type = (iface.type || '').toLowerCase();
  if (EXCLUDED_TYPES.has(type)) return false;
  if (type === 'linux-bridge' || type === 'ovs-bridge') return false;
  if (type && type !== 'ethernet' && type !== 'bond') return false;
  return true;
}

/**
 * Extract physical ethernet + bond interfaces from NNS.
 * Bridges often sit on top of bonds, so bonds are valid bridge ports.
 */
export function physicalNicsFromNns(
  nnsList: NodeNetworkStateKind[],
  nodes: NodeKindLite[],
): PhysicalNic[] {
  const nodeByName = new Map(nodes.map((n) => [n.metadata.name, n]));
  const nics: PhysicalNic[] = [];

  for (const nns of nnsList) {
    const nodeName = nns.metadata.name;
    const node = nodeByName.get(nodeName);
    const role = nodeRoleFromLabels(node?.metadata.labels || nns.metadata.labels);
    const interfaces = nns.status?.currentState?.interfaces || [];

    for (const iface of interfaces) {
      if (!isPhysicalOrBond(iface) || !iface.name) continue;
      const speed = iface.ethernet?.speed;
      nics.push({
        id: `${nodeName}/${iface.name}`,
        nodeName,
        nodeRole: role,
        name: iface.name,
        macAddress: iface['mac-address'] || '—',
        state: iface.state || 'unknown',
        speedMbps: typeof speed === 'number' && speed > 0 ? speed : undefined,
        mtu: iface.mtu,
        controller: iface.controller,
        type: (iface.type || 'ethernet').toLowerCase(),
      });
    }
  }

  nics.sort((a, b) => {
    const nodeCmp = a.nodeName.localeCompare(b.nodeName);
    if (nodeCmp !== 0) return nodeCmp;
    return a.name.localeCompare(b.name);
  });

  return nics;
}

export function fingerprintNicNames(names: string[]): string {
  return Array.from(new Set(names.filter(Boolean)))
    .sort()
    .join(',');
}

function nicsForNode(allNics: PhysicalNic[], nodeName: string): PhysicalNic[] {
  return allNics.filter((n) => n.nodeName === nodeName);
}

function mcpSortKey(name: string): string {
  if (name === 'master') return '0-master';
  if (name === 'worker') return '1-worker';
  return `2-${name}`;
}

export function buildMcpNicGroups(
  mcps: MachineConfigPoolKind[],
  nodes: NodeKindLite[],
  allNics: PhysicalNic[],
  nnsNames: Set<string>,
): McpNicGroup[] {
  const groups = mcps.map((mcp) => {
    const mcpName = mcp.metadata.name;
    const matchLabels = mcp.spec?.nodeSelector?.matchLabels || {};
    const members = nodesForMcp(mcp, nodes);
    const nodeNames = members.map((n) => n.metadata.name).sort();
    const missingNns = nodeNames.filter((name) => !nnsNames.has(name));
    const fps = new Set<string>();
    let noPhysicalNics = nodeNames.length > 0 && missingNns.length === 0;

    for (const name of nodeNames) {
      if (!nnsNames.has(name)) continue;
      const names = nicsForNode(allNics, name).map((n) => n.name);
      const fp = fingerprintNicNames(names);
      fps.add(fp);
      if (fp) noPhysicalNics = false;
    }

    const identical =
      nodeNames.length > 0 && missingNns.length === 0 && fps.size === 1 && !fps.has('');
    const fingerprint = identical ? Array.from(fps)[0] : '';
    const mixed =
      nodeNames.length > 0 && missingNns.length === 0 && (fps.size > 1 || fps.has(''));

    return {
      mcpName,
      nodeSelector: { ...matchLabels },
      nodeNames,
      fingerprint,
      identical,
      mixed,
      missingNns,
      noPhysicalNics,
    };
  });

  groups.sort((a, b) => mcpSortKey(a.mcpName).localeCompare(mcpSortKey(b.mcpName)));
  return groups;
}

export function uniqueNodeNames(groups: McpNicGroup[]): string[] {
  return Array.from(new Set(groups.flatMap((g) => g.nodeNames))).sort();
}

export function canSelectMcpWith(selected: McpNicGroup[], candidate: McpNicGroup): boolean {
  if (!candidate.identical) return false;
  if (selected.length === 0) return true;
  return selected.every((g) => g.identical && g.fingerprint === candidate.fingerprint);
}

export function isControlPlaneMcp(group: McpNicGroup): boolean {
  if (group.mcpName === 'master') return true;
  const keys = Object.keys(group.nodeSelector);
  return (
    keys.includes('node-role.kubernetes.io/master') ||
    keys.includes('node-role.kubernetes.io/control-plane')
  );
}

export function layoutNicsForNodes(
  allNics: PhysicalNic[],
  nodeNames: string[],
  nicNames: string[],
): LayoutNic[] {
  const target = new Set(nodeNames);
  const ordered = [...nicNames].sort();
  return ordered.map((name) => {
    const rows = allNics.filter((n) => n.name === name && target.has(n.nodeName));
    const speeds = Array.from(
      new Set(
        rows.map((n) => n.speedMbps).filter((s): s is number => typeof s === 'number' && s > 0),
      ),
    );
    const states = Array.from(new Set(rows.map((n) => n.state || 'unknown')));
    const enslaved = rows.filter((n) => n.controller);
    const controllers = Array.from(
      new Set(enslaved.map((n) => n.controller).filter((c): c is string => Boolean(c))),
    );
    const types = Array.from(new Set(rows.map((n) => n.type)));
    return {
      name,
      speedMbps: speeds.length === 1 ? speeds[0] : undefined,
      speedMixed: speeds.length > 1,
      state: states.length === 1 ? states[0] : 'mixed',
      stateMixed: states.length > 1,
      enslavedControllers: controllers,
      enslavedNodeCount: enslaved.length,
      targetNodeCount: nodeNames.length,
      type: types.length === 1 ? types[0] : 'ethernet',
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Existing bridge discovery                                          */
/* ------------------------------------------------------------------ */

function bridgePortNames(iface: NmstateInterfaceStatus): string[] {
  const ports = iface.bridge?.port || [];
  const names: string[] = [];
  for (const p of ports) {
    if (typeof p === 'string' && p) names.push(p);
    else if (p && typeof p === 'object' && p.name) names.push(p.name);
  }
  return names;
}

function nnsInterfaces(nns: NodeNetworkStateKind): NmstateInterfaceStatus[] {
  return nns.status?.currentState?.interfaces || [];
}

export type ExistingBridge = {
  name: string;
  type: BridgeType;
  ports: string[];
  nodeName: string;
};

export function existingBridgesFromNns(nnsList: NodeNetworkStateKind[]): ExistingBridge[] {
  const bridges: ExistingBridge[] = [];
  for (const nns of nnsList) {
    const nodeName = nns.metadata.name;
    for (const iface of nnsInterfaces(nns)) {
      if (!iface.name) continue;
      const type = (iface.type || '').toLowerCase();
      if (type !== 'linux-bridge' && type !== 'ovs-bridge') continue;
      bridges.push({
        name: iface.name,
        type: type as BridgeType,
        ports: bridgePortNames(iface),
        nodeName,
      });
    }
  }
  return bridges;
}

/* ------------------------------------------------------------------ */
/*  Bridge inventory (cross-reference NNS bridges with NNCPs)          */
/* ------------------------------------------------------------------ */

export type BridgeInventoryItem = {
  name: string;
  type: BridgeType;
  ports: string[];
  nodeNames: string[];
  nncpNames: string[];
  managedByTool: boolean;
  inNns: boolean;
  nncpAlreadyAbsent: boolean;
  brExNodeNames: string[];
  dependentNames: string[];
  canRemove: boolean;
  blockReason?: PlanMessage;
  vlanId?: number;
};

function isBridgeIface(iface: { type?: string }): boolean {
  const t = (iface.type || '').toLowerCase();
  return t === 'linux-bridge' || t === 'ovs-bridge';
}

export function isManagedByBridgeTool(nncp: NncpKind): boolean {
  const labels = nncp.metadata.labels || {};
  if (BRIDGE_TOOL_MANAGED_BY.has(labels['app.kubernetes.io/managed-by'] || '')) return true;
  return labels['app.kubernetes.io/name'] === BRIDGE_TOOL_NAME_LABEL;
}

function nncpBridgeInterfaces(nncp: NncpKind): NncpDesiredInterface[] {
  return (nncp.spec?.desiredState?.interfaces || []).filter((iface) => isBridgeIface(iface));
}

function nncpDefinesBridge(nncp: NncpKind, bridgeName: string): boolean {
  return nncpBridgeInterfaces(nncp).some((iface) => iface.name === bridgeName);
}

function nncpBridgeState(nncp: NncpKind, bridgeName: string): string {
  const iface = nncpBridgeInterfaces(nncp).find((i) => i.name === bridgeName);
  return (iface?.state || '').toLowerCase();
}

export function nncpAppliesToAnyNode(
  nncp: NncpKind,
  nodes: NodeKindLite[],
  nodeNames: string[],
): boolean {
  const want = new Set(nodeNames);
  return nodes.some(
    (n) =>
      want.has(n.metadata.name) &&
      nodeMatchesNncpSelector(n.metadata.labels, nncp.spec?.nodeSelector),
  );
}

export function nodesMatchingNncp(nncp: NncpKind, nodes: NodeKindLite[]): string[] {
  return nodes
    .filter((n) => nodeMatchesNncpSelector(n.metadata.labels, nncp.spec?.nodeSelector))
    .map((n) => n.metadata.name)
    .sort();
}

export function defaultRouteInterfaces(nns: NodeNetworkStateKind): string[] {
  const routes = nns.status?.currentState?.routes;
  const lists = [...(routes?.running || []), ...(routes?.config || [])];
  const names = lists
    .filter((r) => r.destination === '0.0.0.0/0' && r['next-hop-interface'])
    .map((r) => r['next-hop-interface'] as string);
  return Array.from(new Set(names));
}

export function brExUplinkChain(nns: NodeNetworkStateKind): Set<string> {
  const ifaces = nnsInterfaces(nns);
  const byName = new Map<string, NmstateInterfaceStatus[]>();
  for (const iface of ifaces) {
    if (!iface.name) continue;
    const list = byName.get(iface.name) || [];
    list.push(iface);
    byName.set(iface.name, list);
  }

  const seeds: string[] = [];
  if (byName.has('br-ex')) seeds.push('br-ex');
  for (const hop of defaultRouteInterfaces(nns)) {
    if (hop === 'br-ex' || !byName.has('br-ex')) {
      if (!seeds.includes(hop)) seeds.push(hop);
    }
  }

  const chain = new Set<string>();
  const queue = [...seeds];
  while (queue.length > 0) {
    const name = queue.pop() as string;
    if (!name || chain.has(name)) continue;
    chain.add(name);

    for (const iface of byName.get(name) || []) {
      for (const port of bridgePortNames(iface)) queue.push(port);
      const base = iface.vlan?.['base-iface'];
      if (base) queue.push(base);
      if (iface.controller) queue.push(iface.controller);
    }

    for (const iface of ifaces) {
      if (iface.controller === name && iface.name) queue.push(iface.name);
    }
  }

  return chain;
}

export function brExCarrierNodes(
  nnsList: NodeNetworkStateKind[],
  bridgeName: string,
  nodeNames: string[],
): string[] {
  const want = new Set(nodeNames);
  const hits: string[] = [];
  for (const nns of nnsList) {
    const node = nns.metadata.name;
    if (!want.has(node)) continue;
    if (brExUplinkChain(nns).has(bridgeName)) hits.push(node);
  }
  return hits.sort();
}

function bridgeDependentsOnNode(nns: NodeNetworkStateKind, bridgeName: string): string[] {
  const names = new Set<string>();
  for (const iface of nnsInterfaces(nns)) {
    if (!iface.name || iface.name === bridgeName) continue;
    const type = (iface.type || '').toLowerCase();
    if (type === 'ethernet' || type === 'bond') continue;
    if (iface.vlan?.['base-iface'] === bridgeName) names.add(iface.name);
    if (bridgePortNames(iface).includes(bridgeName)) names.add(iface.name);
    if (iface.controller === bridgeName) names.add(iface.name);
  }
  return Array.from(names).sort();
}

export function listBridgeInventory(opts: {
  nnsList: NodeNetworkStateKind[];
  nncps: NncpKind[];
  nodes: NodeKindLite[];
  scopeNodeNames: string[];
}): BridgeInventoryItem[] {
  const scope = new Set(opts.scopeNodeNames);
  const scopedNodes = opts.nodes.filter((n) => scope.has(n.metadata.name));
  const byName = new Map<
    string,
    {
      type: BridgeType;
      ports: Set<string>;
      nodeNames: Set<string>;
      nncpNames: Set<string>;
      managedByTool: boolean;
      absentNncps: number;
      bridgeNncps: number;
      vlanId?: number;
    }
  >();

  const ensure = (name: string, type: BridgeType) => {
    let row = byName.get(name);
    if (!row) {
      row = {
        type,
        ports: new Set(),
        nodeNames: new Set(),
        nncpNames: new Set(),
        managedByTool: false,
        absentNncps: 0,
        bridgeNncps: 0,
      };
      byName.set(name, row);
    }
    return row;
  };

  for (const nns of opts.nnsList) {
    if (!scope.has(nns.metadata.name)) continue;
    for (const iface of nnsInterfaces(nns)) {
      if (!iface.name || !isBridgeIface(iface)) continue;
      const type = (iface.type || '').toLowerCase() as BridgeType;
      const row = ensure(iface.name, type);
      row.nodeNames.add(nns.metadata.name);
      bridgePortNames(iface).forEach((p) => row.ports.add(p));
    }
  }

  for (const nncp of opts.nncps) {
    if (!nncpAppliesToAnyNode(nncp, scopedNodes.length ? scopedNodes : opts.nodes, opts.scopeNodeNames)) {
      continue;
    }
    for (const iface of nncpBridgeInterfaces(nncp)) {
      if (!iface.name) continue;
      const type = (iface.type || '').toLowerCase() as BridgeType;
      const row = ensure(iface.name, type);
      row.nncpNames.add(nncp.metadata.name);
      row.bridgeNncps += 1;
      if ((iface.state || '').toLowerCase() === 'absent') row.absentNncps += 1;
      if (isManagedByBridgeTool(nncp)) row.managedByTool = true;
      if (iface.bridge?.port) {
        iface.bridge.port.forEach((p) => {
          if (p.name) row.ports.add(p.name);
        });
      }
    }
  }

  const items: BridgeInventoryItem[] = [];
  Array.from(byName.keys())
    .sort()
    .forEach((name) => {
      const row = byName.get(name)!;
      const nncpNames = Array.from(row.nncpNames).sort();
      const matching = opts.nncps.filter((n) => nncpNames.includes(n.metadata.name));
      const applyNodes = new Set<string>(row.nodeNames);
      if (matching.length === 0) {
        opts.scopeNodeNames.forEach((n) => applyNodes.add(n));
      } else {
        matching.forEach((nncp) => {
          nodesMatchingNncp(nncp, opts.nodes).forEach((n) => applyNodes.add(n));
        });
      }

      const brExNodeNames = brExCarrierNodes(opts.nnsList, name, Array.from(applyNodes));
      const dependent = new Set<string>();
      for (const nns of opts.nnsList) {
        if (!applyNodes.has(nns.metadata.name) && !row.nodeNames.has(nns.metadata.name)) continue;
        bridgeDependentsOnNode(nns, name).forEach((d) => dependent.add(d));
      }
      const unmanagedDependents = Array.from(dependent).sort();

      const inNns = row.nodeNames.size > 0;
      const nncpAlreadyAbsent = row.bridgeNncps > 0 && row.absentNncps === row.bridgeNncps;
      let blockReason: PlanMessage | undefined;
      if (brExNodeNames.length > 0) {
        blockReason = {
          key: 'Cannot remove {{name}}: it carries br-ex (cluster default network) on {{nodes}}.',
          values: { name, nodes: brExNodeNames.join(', ') },
        };
      } else if (unmanagedDependents.length > 0 && inNns) {
        blockReason = {
          key: 'Cannot remove {{name}}: dependents still use it ({{dependents}}). Remove those first.',
          values: { name, dependents: unmanagedDependents.join(', ') },
        };
      }

      items.push({
        name,
        type: row.type,
        ports: Array.from(row.ports).sort(),
        nodeNames: Array.from(row.nodeNames).sort(),
        nncpNames,
        managedByTool: row.managedByTool,
        inNns,
        nncpAlreadyAbsent,
        brExNodeNames,
        dependentNames: unmanagedDependents,
        canRemove: !blockReason,
        blockReason,
        vlanId: row.vlanId,
      });
    });

  return items;
}

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

export function validateBridgeName(name: string): PlanMessage | undefined {
  const trimmed = name.trim();
  if (!trimmed) return { key: 'Bridge name is required' };
  if (trimmed.length > 15) return { key: 'Bridge name must be 15 characters or fewer' };
  if (!LINUX_IFACE_NAME.test(trimmed)) {
    return {
      key: 'Bridge name must start with a letter and use only letters, digits, underscore, dot, or hyphen',
    };
  }
  if (trimmed === 'lo') return { key: 'Bridge name cannot be lo' };
  return undefined;
}

export function validateIpv4(ipv4: BridgeIpv4Config): PlanMessage | undefined {
  if (ipv4.mode !== 'static') return undefined;
  if (!ipv4.address || !IPV4.test(ipv4.address.trim())) {
    return { key: 'Enter a valid IPv4 address' };
  }
  const prefix = ipv4.prefixLength ?? 24;
  if (!Number.isInteger(prefix) || prefix < 1 || prefix > 32) {
    return { key: 'Prefix length must be an integer from 1 to 32' };
  }
  if (ipv4.gateway && !IPV4.test(ipv4.gateway.trim())) {
    return { key: 'Enter a valid gateway IPv4 address, or leave it empty' };
  }
  return undefined;
}

export function validateVlanId(vlanId: string): PlanMessage | undefined {
  const n = parseInt(vlanId, 10);
  if (!Number.isInteger(n) || n < 1 || n > 4094) {
    return { key: 'VLAN ID must be an integer from 1 to 4094' };
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/*  Name helpers                                                       */
/* ------------------------------------------------------------------ */

export function sanitizeK8sName(raw: string): string {
  const s = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 253);
  return s || 'netbridge';
}

export function existingBridgeNamesOnNodes(
  nnsList: NodeNetworkStateKind[],
  nodeNames: string[],
): Set<string> {
  const want = new Set(nodeNames);
  const out = new Set<string>();
  for (const nns of nnsList) {
    if (!want.has(nns.metadata.name)) continue;
    for (const iface of nnsInterfaces(nns)) {
      if (!iface.name) continue;
      const type = (iface.type || '').toLowerCase();
      if (type === 'linux-bridge' || type === 'ovs-bridge') out.add(iface.name);
    }
  }
  return out;
}

export function collectUsedBridgeNames(
  nnsList: NodeNetworkStateKind[],
  nncps: NncpKind[],
  nodes: NodeKindLite[],
  nodeNames: string[],
): Set<string> {
  const used = existingBridgeNamesOnNodes(nnsList, nodeNames);
  const want = new Set(nodeNames);
  const nodeByName = new Map(nodes.map((n) => [n.metadata.name, n]));
  for (const nncp of nncps) {
    const applies = Array.from(want).some((name) => {
      const node = nodeByName.get(name);
      return node ? nodeMatchesNncpSelector(node.metadata.labels, nncp.spec?.nodeSelector) : false;
    });
    if (applies) {
      for (const iface of (nncp.spec?.desiredState?.interfaces || [])) {
        if (iface.name) used.add(iface.name);
      }
    }
  }
  return used;
}

export function suggestBridgeName(
  used: Set<string>,
  bridgeType: BridgeType,
): string {
  const prefix = bridgeType === 'ovs-bridge' ? 'ovs-br' : 'br';
  for (let i = 1; i < 100; i += 1) {
    const candidate = `${prefix}${i}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${prefix}99`;
}

/* ------------------------------------------------------------------ */
/*  NNCP target planning                                               */
/* ------------------------------------------------------------------ */

export type NncpTarget = {
  mcpName?: string;
  nodeSelector: Record<string, string>;
  nodeNames: string[];
};

function sameNodeSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const as = [...a].sort();
  const bs = [...b].sort();
  return as.every((v, i) => v === bs[i]);
}

function pairwiseDisjoint(sets: string[][]): boolean {
  const seen = new Set<string>();
  for (const s of sets) {
    for (const n of s) {
      if (seen.has(n)) return false;
      seen.add(n);
    }
  }
  return true;
}

export function planNncpTargets(groups: McpNicGroup[]): {
  mode: 'mcp' | 'per-node';
  targets: NncpTarget[];
} {
  if (groups.length === 0) return { mode: 'mcp', targets: [] };
  const union = uniqueNodeNames(groups);
  const hasSelector = (g: McpNicGroup) => Object.keys(g.nodeSelector).length > 0;
  const covers = groups.filter((g) => sameNodeSet(g.nodeNames, union) && hasSelector(g));
  if (covers.length > 0) {
    const cover =
      covers.find((g) => g.mcpName === 'worker') ||
      covers.find((g) => 'node-role.kubernetes.io/worker' in g.nodeSelector) ||
      [...covers].sort((a, b) => a.mcpName.localeCompare(b.mcpName))[0];
    return {
      mode: 'mcp',
      targets: [
        {
          mcpName: cover.mcpName,
          nodeSelector: cover.nodeSelector,
          nodeNames: union,
        },
      ],
    };
  }
  if (pairwiseDisjoint(groups.map((g) => g.nodeNames)) && groups.every(hasSelector)) {
    return {
      mode: 'mcp',
      targets: groups.map((g) => ({
        mcpName: g.mcpName,
        nodeSelector: g.nodeSelector,
        nodeNames: g.nodeNames,
      })),
    };
  }
  return {
    mode: 'per-node',
    targets: union.map((nodeName) => ({
      nodeSelector: { 'kubernetes.io/hostname': nodeName },
      nodeNames: [nodeName],
    })),
  };
}

/* ------------------------------------------------------------------ */
/*  NNCP generation — linux-bridge and ovs-bridge                      */
/* ------------------------------------------------------------------ */

function ipv4Spec(ipv4: BridgeIpv4Config): Record<string, unknown> {
  if (ipv4.mode === 'dhcp') {
    return { enabled: true, dhcp: true };
  }
  if (ipv4.mode === 'static') {
    return {
      enabled: true,
      dhcp: false,
      address: [
        {
          ip: ipv4.address!.trim(),
          'prefix-length': ipv4.prefixLength ?? 24,
        },
      ],
    };
  }
  return { enabled: false };
}

export type BuildBridgeNncpOpts = {
  bridgeName: string;
  bridgeType: BridgeType;
  portName: string;
  vlanTag?: number;
  vlanBaseIface?: string;
  bridgeOptions: {
    stp?: boolean;
    mcastSnooping?: boolean;
    allowExtraPatchPorts?: boolean;
  };
  ovnBridgeMappings?: OvnBridgeMapping[];
  ipv4: BridgeIpv4Config;
  nodeSelector: Record<string, string>;
  policyName: string;
};

export function buildBridgeDesiredState(opts: BuildBridgeNncpOpts): Record<string, unknown> {
  const interfaces: Record<string, unknown>[] = [];

  if (opts.bridgeType === 'linux-bridge') {
    let actualPort = opts.portName;

    if (opts.vlanTag && opts.vlanTag > 0) {
      const vlanIfaceName = `${opts.vlanBaseIface || opts.portName}.${opts.vlanTag}`;
      interfaces.push({
        name: vlanIfaceName,
        type: 'vlan',
        state: 'up',
        vlan: {
          'base-iface': opts.vlanBaseIface || opts.portName,
          id: opts.vlanTag,
        },
      });
      actualPort = vlanIfaceName;
    }

    const bridgeOpts: Record<string, unknown> = {};
    if (opts.bridgeOptions.stp !== undefined) {
      bridgeOpts.stp = { enabled: opts.bridgeOptions.stp };
    }

    interfaces.push({
      name: opts.bridgeName,
      type: 'linux-bridge',
      state: 'up',
      ipv4: ipv4Spec(opts.ipv4),
      ipv6: { enabled: false },
      bridge: {
        port: [{ name: actualPort }],
        options: Object.keys(bridgeOpts).length > 0 ? bridgeOpts : undefined,
      },
    });
  } else {
    const bridgeOpts: Record<string, unknown> = {};
    if (opts.bridgeOptions.stp !== undefined) {
      bridgeOpts.stp = opts.bridgeOptions.stp;
    }
    if (opts.bridgeOptions.mcastSnooping !== undefined) {
      bridgeOpts['mcast-snooping-enable'] = opts.bridgeOptions.mcastSnooping;
    }
    if (opts.bridgeOptions.allowExtraPatchPorts !== undefined) {
      bridgeOpts['allow-extra-patch-ports'] = opts.bridgeOptions.allowExtraPatchPorts;
    }

    let actualPort = opts.portName;
    if (opts.vlanTag && opts.vlanTag > 0) {
      const vlanIfaceName = `${opts.vlanBaseIface || opts.portName}.${opts.vlanTag}`;
      interfaces.push({
        name: vlanIfaceName,
        type: 'vlan',
        state: 'up',
        vlan: {
          'base-iface': opts.vlanBaseIface || opts.portName,
          id: opts.vlanTag,
        },
      });
      actualPort = vlanIfaceName;
    }

    interfaces.push({
      name: opts.bridgeName,
      type: 'ovs-bridge',
      state: 'up',
      ipv4: ipv4Spec(opts.ipv4),
      ipv6: { enabled: false },
      bridge: {
        port: [{ name: actualPort }],
        options: Object.keys(bridgeOpts).length > 0 ? bridgeOpts : undefined,
      },
    });
  }

  const desired: Record<string, unknown> = { interfaces };

  if (opts.ipv4.mode === 'static' && opts.ipv4.gateway?.trim()) {
    desired.routes = {
      config: [
        {
          destination: '0.0.0.0/0',
          'next-hop-address': opts.ipv4.gateway.trim(),
          'next-hop-interface': opts.bridgeName,
          'table-id': 254,
        },
      ],
    };
  }

  if (opts.bridgeType === 'ovs-bridge' && opts.ovnBridgeMappings && opts.ovnBridgeMappings.length > 0) {
    desired['ovn'] = {
      'bridge-mappings': opts.ovnBridgeMappings.map((m) => ({
        localnet: m.localnet,
        bridge: m.bridge,
        state: 'present',
      })),
    };
  }

  return desired;
}

export function buildBridgeNncp(opts: BuildBridgeNncpOpts): NncpResource {
  return {
    apiVersion: 'nmstate.io/v1',
    kind: 'NodeNetworkConfigurationPolicy',
    metadata: {
      name: opts.policyName,
      labels: {
        'app.kubernetes.io/managed-by': 'oct-network-bridge',
        'app.kubernetes.io/name': 'network-bridge',
      },
    },
    spec: {
      nodeSelector: opts.nodeSelector,
      desiredState: buildBridgeDesiredState(opts),
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Bridge removal                                                     */
/* ------------------------------------------------------------------ */

export type BridgeRemovePlan = {
  bridgeName: string;
  desiredState: Record<string, unknown>;
  targetNodeNames: string[];
  patchPolicyNames: string[];
  createPolicies: NncpResource[];
  deletePolicyNames: string[];
  skipApply: boolean;
  issues: PlanMessage[];
  warnings: PlanMessage[];
};

export function buildAbsentBridgeDesiredState(opts: {
  bridgeName: string;
  bridgeType: BridgeType;
}): Record<string, unknown> {
  return {
    interfaces: [
      {
        name: opts.bridgeName,
        type: opts.bridgeType,
        state: 'absent',
      },
    ],
  };
}

export function planBridgeRemoval(opts: {
  item: BridgeInventoryItem;
  selectedGroups: McpNicGroup[];
  nodes: NodeKindLite[];
  nnsList: NodeNetworkStateKind[];
  nncps: NncpKind[];
  scopeNodeNames: string[];
}): BridgeRemovePlan {
  const bridgeName = opts.item.name;
  const issues: PlanMessage[] = [];
  const warnings: PlanMessage[] = [];
  const empty: BridgeRemovePlan = {
    bridgeName,
    desiredState: { interfaces: [] },
    targetNodeNames: [],
    patchPolicyNames: [],
    createPolicies: [],
    deletePolicyNames: [],
    skipApply: false,
    issues,
    warnings,
  };

  if (!bridgeName) {
    issues.push({ key: 'Bridge name is required' });
    return empty;
  }

  const matchingNncps = opts.nncps.filter((nncp) => {
    if (!nncpDefinesBridge(nncp, bridgeName)) return false;
    return nncpAppliesToAnyNode(nncp, opts.nodes, opts.scopeNodeNames);
  });

  const applyNodes = new Set<string>();
  if (matchingNncps.length > 0) {
    matchingNncps.forEach((nncp) => {
      nodesMatchingNncp(nncp, opts.nodes).forEach((n) => applyNodes.add(n));
    });
  } else if (opts.selectedGroups.length > 0) {
    uniqueNodeNames(opts.selectedGroups).forEach((n) => applyNodes.add(n));
  } else {
    opts.scopeNodeNames.forEach((n) => applyNodes.add(n));
  }

  const targetNodeNames = Array.from(applyNodes).sort();
  const brExNodes = brExCarrierNodes(opts.nnsList, bridgeName, targetNodeNames);
  if (brExNodes.length > 0) {
    issues.push({
      key: 'Cannot remove {{name}}: it carries br-ex (cluster default network) on {{nodes}}.',
      values: { name: bridgeName, nodes: brExNodes.join(', ') },
    });
    return { ...empty, targetNodeNames };
  }

  const stillPresentPolicies = matchingNncps.filter(
    (n) => nncpBridgeState(n, bridgeName) !== 'absent',
  );
  const foreignPresent = stillPresentPolicies.filter((n) => !isManagedByBridgeTool(n));
  if (foreignPresent.length > 0) {
    issues.push({
      key: 'Cannot remove {{name}}: policy {{policies}} still defines this bridge and was not created by Network Bridge.',
      values: {
        name: bridgeName,
        policies: foreignPresent.map((p) => p.metadata.name).join(', '),
      },
    });
    return { ...empty, targetNodeNames };
  }

  const desiredState = buildAbsentBridgeDesiredState({
    bridgeName,
    bridgeType: opts.item.type,
  });

  const stillInNns = opts.nnsList.some(
    (nns) =>
      applyNodes.has(nns.metadata.name) &&
      nnsInterfaces(nns).some((iface) => iface.name === bridgeName && isBridgeIface(iface)),
  );
  const alreadyAbsent =
    !stillInNns && matchingNncps.length > 0 && stillPresentPolicies.length === 0;

  const ours = matchingNncps.filter(isManagedByBridgeTool);
  const patchPolicyNames: string[] = [];
  const deletePolicyNames: string[] = [];
  const createPolicies: NncpResource[] = [];

  if (alreadyAbsent) {
    ours.forEach((n) => deletePolicyNames.push(n.metadata.name));
    return {
      bridgeName,
      desiredState,
      targetNodeNames,
      patchPolicyNames,
      createPolicies,
      deletePolicyNames,
      skipApply: true,
      issues,
      warnings,
    };
  }

  if (ours.length > 0) {
    ours.forEach((n) => {
      patchPolicyNames.push(n.metadata.name);
      deletePolicyNames.push(n.metadata.name);
    });
  } else {
    const groups = opts.selectedGroups.filter((g) => g.identical);
    let mode: 'mcp' | 'per-node';
    let targets: NncpTarget[];
    if (groups.length > 0) {
      const planned = planNncpTargets(groups);
      mode = planned.mode;
      targets = planned.targets;
    } else {
      mode = 'per-node';
      targets = targetNodeNames.map((nodeName) => ({
        nodeSelector: { 'kubernetes.io/hostname': nodeName },
        nodeNames: [nodeName],
      }));
    }

    if (targets.length === 0) {
      issues.push({ key: 'Select at least one MachineConfigPool' });
      return { ...empty, targetNodeNames };
    }

    const mcpSuffix = groups
      .map((g) => g.mcpName)
      .sort()
      .join('-');

    targets.forEach((target) => {
      let name: string;
      if (mode === 'per-node') {
        name = sanitizeK8sName(`${bridgeName}-absent-${target.nodeNames[0]}`);
      } else if (targets.length === 1) {
        name = sanitizeK8sName(`${bridgeName}-absent-${mcpSuffix || 'nodes'}`);
      } else {
        name = sanitizeK8sName(`${bridgeName}-absent-${target.mcpName || 'node'}`);
      }
      createPolicies.push({
        apiVersion: 'nmstate.io/v1',
        kind: 'NodeNetworkConfigurationPolicy',
        metadata: {
          name,
          labels: {
            'app.kubernetes.io/managed-by': 'oct-network-bridge',
            'app.kubernetes.io/name': 'network-bridge',
          },
        },
        spec: {
          nodeSelector: target.nodeSelector,
          desiredState,
        },
      });
      deletePolicyNames.push(name);
    });
  }

  return {
    bridgeName,
    desiredState,
    targetNodeNames,
    patchPolicyNames,
    createPolicies,
    deletePolicyNames,
    skipApply: false,
    issues,
    warnings,
  };
}

/* ------------------------------------------------------------------ */
/*  NNCP apply helpers                                                 */
/* ------------------------------------------------------------------ */

function k8sCondition(
  conditions: K8sCondition[] | undefined,
  type: string,
) {
  return (conditions || []).find((c) => c.type === type);
}

export function nncesForPolicy(nnces: NnceKind[], policyName: string): NnceKind[] {
  return nnces.filter((e) => (e.metadata.labels || {})['nmstate.io/policy'] === policyName);
}

export function nncpApplyOutcome(
  nncp: NncpKind,
  opts: { minGeneration: number; startedAtMs: number; nnces?: NnceKind[] },
): 'pending' | 'success' | 'failed' {
  const gen = nncp.metadata.generation ?? 0;
  const available = k8sCondition(nncp.status?.conditions, 'Available');
  const degraded = k8sCondition(nncp.status?.conditions, 'Degraded');
  const progressing = k8sCondition(nncp.status?.conditions, 'Progressing');

  if (degraded?.status === 'True') {
    const hb = Date.parse(degraded.lastHeartbeatTime || degraded.lastTransitionTime || '') || 0;
    if (hb >= opts.startedAtMs - 1000 || (degraded.reason || '').toLowerCase().includes('fail')) {
      return 'failed';
    }
  }

  const enactments = nncesForPolicy(opts.nnces || [], nncp.metadata.name);
  if (enactments.length > 0) {
    const failed = enactments.some((e) => {
      const failing = k8sCondition(e.status?.conditions, 'Failing');
      const eGen = e.status?.policyGeneration ?? 0;
      return failing?.status === 'True' && eGen >= opts.minGeneration;
    });
    if (failed) return 'failed';
    const allReady = enactments.every((e) => {
      const eGen = e.status?.policyGeneration ?? 0;
      const av = k8sCondition(e.status?.conditions, 'Available');
      return eGen >= opts.minGeneration && av?.status === 'True';
    });
    if (allReady) return 'success';
    return 'pending';
  }

  if (progressing?.status === 'True') return 'pending';

  if (
    gen >= opts.minGeneration &&
    available?.status === 'True' &&
    (available.reason === 'SuccessfullyConfigured' || !available.reason)
  ) {
    const hb = Date.parse(available.lastHeartbeatTime || available.lastTransitionTime || '') || 0;
    if (hb >= opts.startedAtMs - 2000) return 'success';
  }

  return 'pending';
}

export function nncpFailMessage(nncp: NncpKind): string {
  const degraded = k8sCondition(nncp.status?.conditions, 'Degraded');
  return degraded?.message || degraded?.reason || 'NMState failed to apply the policy';
}

export function nnceProgressSummary(
  nnces: NnceKind[],
  policyName: string,
  minGeneration: number,
): { ready: number; total: number } {
  const list = nncesForPolicy(nnces, policyName);
  const ready = list.filter((e) => {
    const gen = e.status?.policyGeneration ?? 0;
    const available = k8sCondition(e.status?.conditions, 'Available');
    return gen >= minGeneration && available?.status === 'True';
  }).length;
  return { ready, total: list.length };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
