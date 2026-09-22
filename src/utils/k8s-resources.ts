import { K8sModel } from '@openshift-console/dynamic-plugin-sdk';

export const NodeModel: K8sModel = {
  apiVersion: 'v1',
  kind: 'Node',
  abbr: 'N',
  label: 'Node',
  labelPlural: 'Nodes',
  plural: 'nodes',
  namespaced: false,
};

/** Cluster-scoped NMState report of a node's live interfaces. */
export const NodeNetworkStateModel: K8sModel = {
  apiVersion: 'v1beta1',
  apiGroup: 'nmstate.io',
  kind: 'NodeNetworkState',
  abbr: 'NNS',
  label: 'NodeNetworkState',
  labelPlural: 'NodeNetworkStates',
  plural: 'nodenetworkstates',
  namespaced: false,
};

/** Cluster-scoped NMState desired-state policy. Network Bridge creates these. */
export const NodeNetworkConfigurationPolicyModel: K8sModel = {
  apiVersion: 'v1',
  apiGroup: 'nmstate.io',
  kind: 'NodeNetworkConfigurationPolicy',
  abbr: 'NNCP',
  label: 'NodeNetworkConfigurationPolicy',
  labelPlural: 'NodeNetworkConfigurationPolicies',
  plural: 'nodenetworkconfigurationpolicies',
  namespaced: false,
};

/**
 * Per-node enactment of an NNCP. The NMState operator applies policies to matching
 * nodes (typically the same labels as a MachineConfigPool); each node gets an NNCE.
 */
export const NodeNetworkConfigurationEnactmentModel: K8sModel = {
  apiVersion: 'v1beta1',
  apiGroup: 'nmstate.io',
  kind: 'NodeNetworkConfigurationEnactment',
  abbr: 'NNCE',
  label: 'NodeNetworkConfigurationEnactment',
  labelPlural: 'NodeNetworkConfigurationEnactments',
  plural: 'nodenetworkconfigurationenactments',
  namespaced: false,
};

/** Cluster-scoped Machine Config Operator pool. Network Bridge groups nodes by MCP. */
export const MachineConfigPoolModel: K8sModel = {
  apiVersion: 'v1',
  apiGroup: 'machineconfiguration.openshift.io',
  kind: 'MachineConfigPool',
  abbr: 'MCP',
  label: 'MachineConfigPool',
  labelPlural: 'MachineConfigPools',
  plural: 'machineconfigpools',
  namespaced: false,
};
