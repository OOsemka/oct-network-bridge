import {
  K8sResourceCommon,
  DocumentTitle,
  ListPageHeader,
  k8sCreate,
  k8sDelete,
  k8sGet,
  k8sUpdate,
  useK8sWatchResource,
} from '@openshift-console/dynamic-plugin-sdk';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom-v5-compat';
import {
  ActionGroup,
  Alert,
  Breadcrumb,
  BreadcrumbItem,
  Bullseye,
  Button,
  Card,
  CardBody,
  CardTitle,
  Checkbox,
  CodeBlock,
  CodeBlockCode,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  EmptyState,
  EmptyStateBody,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  NumberInput,
  PageSection,
  Radio,
  Spinner,
  Stack,
  StackItem,
  TextInput,
  Title,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
} from '@patternfly/react-core';
import { Table, Thead, Tr, Th, Tbody, Td } from '@patternfly/react-table';
import { NetworkIcon, ExclamationCircleIcon, PlusCircleIcon, MinusCircleIcon } from '@patternfly/react-icons';
import React, { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  MachineConfigPoolModel,
  NodeModel,
  NodeNetworkStateModel,
  NodeNetworkConfigurationPolicyModel,
  NodeNetworkConfigurationEnactmentModel,
} from '../utils/k8s-resources';
import {
  BridgeIpv4Config,
  BridgeInventoryItem,
  BridgeRemovePlan,
  BridgeType,
  BuildBridgeNncpOpts,
  Ipv4Mode,
  LayoutNic,
  MachineConfigPoolKind,
  McpNicGroup,
  NNCP_APPLY_POLL_MS,
  NNCP_APPLY_TIMEOUT_MS,
  NnceKind,
  NncpKind,
  NncpResource,
  NodeKindLite,
  NodeNetworkStateKind,
  OvnBridgeMapping,
  buildBridgeNncp,
  buildMcpNicGroups,
  canSelectMcpWith,
  collectUsedBridgeNames,
  formatSpeed,
  getK8sErrorMessage,
  isForbiddenError,
  isMissingCrdError,
  isControlPlaneMcp,
  layoutNicsForNodes,
  listBridgeInventory,
  nnceProgressSummary,
  nncpApplyOutcome,
  nncpFailMessage,
  physicalNicsFromNns,
  planBridgeRemoval,
  planNncpTargets,
  sanitizeK8sName,
  sleep,
  suggestBridgeName,
  uniqueNodeNames,
  validateBridgeName,
  validateIpv4,
  validateVlanId,
} from '../utils/network-bridge';
import { toYaml } from '../utils/yaml';
import dashboardLogger from '../utils/logger';
import CommunityDisclaimer from './CommunityDisclaimer';

import './network-bridge.css';

const LOG_ACTION = 'NETWORK_BRIDGE';

const nncpConsolePath = (name: string) =>
  `/k8s/cluster/nmstate.io~v1~NodeNetworkConfigurationPolicy/${encodeURIComponent(name)}`;

const NetworkBridgePage: FC = () => {
  const { t } = useTranslation('plugin__oct-network-bridge');
  const navigate = useNavigate();

  /* ---- watches ---- */
  const [nnsList, nnsLoaded, nnsError] = useK8sWatchResource<K8sResourceCommon[]>({
    groupVersionKind: {
      group: NodeNetworkStateModel.apiGroup,
      version: NodeNetworkStateModel.apiVersion,
      kind: NodeNetworkStateModel.kind,
    },
    isList: true,
    namespaced: false,
  });

  const [nodeList, nodesLoaded, nodesError] = useK8sWatchResource<K8sResourceCommon[]>({
    groupVersionKind: {
      group: '',
      version: NodeModel.apiVersion,
      kind: NodeModel.kind,
    },
    isList: true,
    namespaced: false,
  });

  const [mcpList, mcpsLoaded, mcpError] = useK8sWatchResource<K8sResourceCommon[]>({
    groupVersionKind: {
      group: MachineConfigPoolModel.apiGroup,
      version: MachineConfigPoolModel.apiVersion,
      kind: MachineConfigPoolModel.kind,
    },
    isList: true,
    namespaced: false,
  });

  const [nncpList, , nncpError] = useK8sWatchResource<K8sResourceCommon[]>({
    groupVersionKind: {
      group: NodeNetworkConfigurationPolicyModel.apiGroup,
      version: NodeNetworkConfigurationPolicyModel.apiVersion,
      kind: NodeNetworkConfigurationPolicyModel.kind,
    },
    isList: true,
    namespaced: false,
  });

  const [nnceList] = useK8sWatchResource<K8sResourceCommon[]>({
    groupVersionKind: {
      group: NodeNetworkConfigurationEnactmentModel.apiGroup,
      version: NodeNetworkConfigurationEnactmentModel.apiVersion,
      kind: NodeNetworkConfigurationEnactmentModel.kind,
    },
    isList: true,
    namespaced: false,
  });

  /* ---- form state ---- */
  const [selectedMcpNames, setSelectedMcpNames] = useState<string[]>([]);
  const [selectedPort, setSelectedPort] = useState('');
  const [bridgeType, setBridgeType] = useState<BridgeType>('linux-bridge');
  const [bridgeName, setBridgeName] = useState('br1');
  const [enableVlan, setEnableVlan] = useState(false);
  const [vlanId, setVlanId] = useState('');
  const [stpEnabled, setStpEnabled] = useState(false);
  const [mcastSnooping, setMcastSnooping] = useState(true);
  const [allowExtraPatchPorts, setAllowExtraPatchPorts] = useState(true);
  const [ovnMappings, setOvnMappings] = useState<OvnBridgeMapping[]>([{ localnet: '', bridge: '' }]);
  const [ipv4Mode, setIpv4Mode] = useState<Ipv4Mode>('none');
  const [ipAddress, setIpAddress] = useState('');
  const [prefixLength, setPrefixLength] = useState('24');
  const [gateway, setGateway] = useState('');

  /* ---- action state ---- */
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ policyNames: string[]; bridgeName: string }>({
    policyNames: [],
    bridgeName: '',
  });
  const [removeTarget, setRemoveTarget] = useState<BridgeInventoryItem | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removePhase, setRemovePhase] = useState('');
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removeSuccess, setRemoveSuccess] = useState<string | null>(null);

  /* ---- derived ---- */
  const nodes = useMemo(() => (nodeList as NodeKindLite[]) || [], [nodeList]);
  const nns = useMemo(() => (nnsList as NodeNetworkStateKind[]) || [], [nnsList]);
  const mcps = useMemo(() => (mcpList as MachineConfigPoolKind[]) || [], [mcpList]);
  const nncps = useMemo(() => (nncpList as NncpKind[]) || [], [nncpList]);
  const nnces = useMemo(() => (nnceList as NnceKind[]) || [], [nnceList]);
  const nncesRef = useRef(nnces);
  nncesRef.current = nnces;

  const allNics = useMemo(() => physicalNicsFromNns(nns, nodes), [nns, nodes]);
  const nnsNames = useMemo(() => new Set(nns.map((item) => item.metadata.name)), [nns]);

  const mcpGroups = useMemo(
    () => buildMcpNicGroups(mcps, nodes, allNics, nnsNames),
    [mcps, nodes, allNics, nnsNames],
  );

  const selectedGroups = useMemo(
    () => mcpGroups.filter((g) => selectedMcpNames.includes(g.mcpName)),
    [mcpGroups, selectedMcpNames],
  );

  const selectedFingerprint = selectedGroups[0]?.identical ? selectedGroups[0].fingerprint : '';

  const scopeNodeNames = useMemo(() => {
    if (selectedGroups.length > 0) {
      return Array.from(new Set(selectedGroups.flatMap((g) => g.nodeNames))).sort();
    }
    return nns.map((item) => item.metadata.name).sort();
  }, [selectedGroups, nns]);

  const bridgeInventory = useMemo(
    () =>
      listBridgeInventory({
        nnsList: nns,
        nncps,
        nodes,
        scopeNodeNames,
      }),
    [nns, nncps, nodes, scopeNodeNames],
  );

  const targetNodeNames = useMemo(
    () => Array.from(new Set(selectedGroups.flatMap((g) => g.nodeNames))).sort(),
    [selectedGroups],
  );

  const layoutNics: LayoutNic[] = useMemo(() => {
    if (!selectedFingerprint) return [];
    return layoutNicsForNodes(allNics, targetNodeNames, selectedFingerprint.split(','));
  }, [allNics, targetNodeNames, selectedFingerprint]);

  const usedBridgeNames = useMemo(
    () => collectUsedBridgeNames(nns, nncps, nodes, targetNodeNames),
    [nns, nncps, nodes, targetNodeNames],
  );

  const createdNames = created.policyNames;

  const clearCreated = useCallback(() => {
    setCreated({ policyNames: [], bridgeName: '' });
    setCreateError(null);
  }, []);

  useEffect(() => {
    setSelectedPort('');
    setCreated({ policyNames: [], bridgeName: '' });
    setCreateError(null);
  }, [selectedFingerprint]);

  useEffect(() => {
    const suggested = suggestBridgeName(usedBridgeNames, bridgeType);
    setBridgeName(suggested);
  }, [bridgeType, usedBridgeNames]);

  useEffect(() => {
    setOvnMappings([{ localnet: '', bridge: bridgeName }]);
  }, [bridgeName]);

  /* ---- ipv4 config ---- */
  const ipv4: BridgeIpv4Config = useMemo(
    () => ({
      mode: ipv4Mode,
      address: ipAddress,
      prefixLength: parseInt(prefixLength, 10) || 24,
      gateway,
    }),
    [ipv4Mode, ipAddress, prefixLength, gateway],
  );

  /* ---- plan / validation ---- */
  const plan = useMemo(() => {
    const issues: { key: string; values?: Record<string, string> }[] = [];
    const warnings: { key: string; values?: Record<string, string> }[] = [];

    if (selectedGroups.length === 0) {
      issues.push({ key: 'Select at least one MachineConfigPool' });
    }

    if (!selectedPort) {
      issues.push({ key: 'Select a port interface for the bridge' });
    }

    const nameIssue = validateBridgeName(bridgeName);
    if (nameIssue) issues.push(nameIssue);

    const ipv4Issue = validateIpv4(ipv4);
    if (ipv4Issue) issues.push(ipv4Issue);

    if (enableVlan && vlanId) {
      const vlanIssue = validateVlanId(vlanId);
      if (vlanIssue) issues.push(vlanIssue);
    }

    if (ipv4.mode === 'static' && targetNodeNames.length > 1) {
      issues.push({
        key: 'Static IPv4 can only be applied when a single node is targeted. Use L2 only or DHCP for multiple nodes.',
      });
    }

    if (bridgeName.trim() && usedBridgeNames.has(bridgeName.trim()) && !created.policyNames.length) {
      issues.push({
        key: 'Bridge name {{name}} already exists. Pick another name.',
        values: { name: bridgeName.trim() },
      });
    }

    if (bridgeType === 'ovs-bridge') {
      const validMappings = ovnMappings.filter((m) => m.localnet.trim());
      if (validMappings.length === 0) {
        issues.push({ key: 'At least one OVN bridge mapping with a localnet name is required for OVS bridges' });
      }
    }

    if (selectedGroups.some(isControlPlaneMcp)) {
      warnings.push({
        key: 'Creating bridges on control-plane nodes can disrupt cluster networking if you select the primary interface.',
      });
    }

    if (issues.length > 0) {
      return { policies: [] as NncpResource[], issues, warnings, targetNodeNames };
    }

    const { targets } = planNncpTargets(selectedGroups);
    const selectedMcpSuffix = selectedGroups
      .map((g) => g.mcpName)
      .sort()
      .join('-');

    const policies = targets.map((target) => {
      let policyName: string;
      if (targets.length === 1) {
        policyName = sanitizeK8sName(`${bridgeName.trim()}-${selectedMcpSuffix}`);
      } else {
        policyName = sanitizeK8sName(`${bridgeName.trim()}-${target.mcpName || 'node'}`);
      }

      const buildOpts: BuildBridgeNncpOpts = {
        bridgeName: bridgeName.trim(),
        bridgeType,
        portName: selectedPort,
        vlanTag: enableVlan && vlanId ? parseInt(vlanId, 10) : undefined,
        vlanBaseIface: enableVlan && vlanId ? selectedPort : undefined,
        bridgeOptions: {
          stp: stpEnabled,
          mcastSnooping: bridgeType === 'ovs-bridge' ? mcastSnooping : undefined,
          allowExtraPatchPorts: bridgeType === 'ovs-bridge' ? allowExtraPatchPorts : undefined,
        },
        ovnBridgeMappings: bridgeType === 'ovs-bridge' ? ovnMappings.filter((m) => m.localnet.trim()) : undefined,
        ipv4,
        nodeSelector: target.nodeSelector,
        policyName,
      };

      return buildBridgeNncp(buildOpts);
    });

    return { policies, issues, warnings, targetNodeNames };
  }, [
    selectedGroups,
    selectedPort,
    bridgeName,
    bridgeType,
    enableVlan,
    vlanId,
    stpEnabled,
    mcastSnooping,
    allowExtraPatchPorts,
    ovnMappings,
    ipv4,
    targetNodeNames,
    usedBridgeNames,
    created.policyNames.length,
  ]);

  const previewYaml = useMemo(() => {
    if (plan.policies.length === 0) return '';
    return plan.policies
      .map((p) => toYaml(p as unknown as Parameters<typeof toYaml>[0]))
      .join('---\n');
  }, [plan.policies]);

  const removePlanPreview = useMemo<BridgeRemovePlan | null>(() => {
    if (!removeTarget) return null;
    return planBridgeRemoval({
      item: removeTarget,
      selectedGroups,
      nodes,
      nnsList: nns,
      nncps,
      scopeNodeNames,
    });
  }, [removeTarget, selectedGroups, nodes, nns, nncps, scopeNodeNames]);

  /* ---- handlers ---- */
  const toggleMcp = useCallback(
    (name: string, checked: boolean) => {
      setSelectedMcpNames((prev) => (checked ? [...prev, name] : prev.filter((x) => x !== name)));
      dashboardLogger.info(LOG_ACTION, 'MCP selection changed', `${checked ? 'selected' : 'deselected'} ${name}`);
      clearCreated();
    },
    [clearCreated],
  );

  const goNetworkHub = () => {
    navigate('/community-tools/network');
  };

  const handleCreate = useCallback(async () => {
    if (plan.policies.length === 0 || plan.issues.length > 0) return;
    setCreating(true);
    setCreateError(null);
    setCreated({ policyNames: [], bridgeName: '' });
    const policyNames = plan.policies.map((p) => p.metadata.name);
    dashboardLogger.info(
      LOG_ACTION,
      'Create started',
      `bridge=${bridgeName.trim()} type=${bridgeType} port=${selectedPort} policies=${policyNames.join(',')}`,
    );

    const succeeded: string[] = [];
    try {
      for (const policy of plan.policies) {
        await k8sCreate({
          model: NodeNetworkConfigurationPolicyModel,
          data: policy as unknown as K8sResourceCommon,
        });
        succeeded.push(policy.metadata.name);
      }
      dashboardLogger.info(LOG_ACTION, 'Create succeeded', succeeded.join(', '));
      setCreated({ policyNames: succeeded, bridgeName: bridgeName.trim() });
    } catch (err) {
      const msg = getK8sErrorMessage(err);
      dashboardLogger.error(LOG_ACTION, 'Create failed', msg);
      const suffix =
        succeeded.length > 0
          ? ` ${t('Created before failure')}: ${succeeded.join(', ')}.`
          : '';
      setCreateError(`${msg}${suffix}`);
      if (succeeded.length > 0) {
        setCreated({ policyNames: succeeded, bridgeName: bridgeName.trim() });
      }
    } finally {
      setCreating(false);
    }
  }, [plan.policies, plan.issues.length, bridgeName, bridgeType, selectedPort, t]);

  const handleCreateAnother = useCallback(() => {
    const nextName = suggestBridgeName(usedBridgeNames, bridgeType);
    dashboardLogger.info(LOG_ACTION, 'Create another bridge', `next=${nextName}`);
    clearCreated();
    setBridgeName(nextName);
    setSelectedPort('');
    setEnableVlan(false);
    setVlanId('');
  }, [usedBridgeNames, bridgeType, clearCreated]);

  const waitForNncpApply = useCallback(
    async (name: string, minGeneration: number, startedAtMs: number) => {
      const deadline = Date.now() + NNCP_APPLY_TIMEOUT_MS;
      while (Date.now() < deadline) {
        const nncp = (await k8sGet({
          model: NodeNetworkConfigurationPolicyModel,
          name,
        })) as NncpKind;
        const outcome = nncpApplyOutcome(nncp, {
          minGeneration,
          startedAtMs,
          nnces: nncesRef.current,
        });
        const progress = nnceProgressSummary(nncesRef.current, name, minGeneration);
        if (progress.total > 0) {
          setRemovePhase(
            t('Waiting for NMState to apply {{name}} ({{ready}}/{{total}} nodes)...', {
              name,
              ready: String(progress.ready),
              total: String(progress.total),
            }),
          );
        } else {
          setRemovePhase(t('Waiting for NMState to apply {{name}}...', { name }));
        }
        if (outcome === 'success') return;
        if (outcome === 'failed') {
          throw new Error(nncpFailMessage(nncp));
        }
        await sleep(NNCP_APPLY_POLL_MS);
      }
      throw new Error(t('Timed out waiting for NMState to apply {{name}}', { name }));
    },
    [t],
  );

  const closeRemoveModal = useCallback(() => {
    if (removing) return;
    setRemoveTarget(null);
    setRemoveError(null);
  }, [removing]);

  const handleRemove = useCallback(
    async (item: BridgeInventoryItem) => {
      const removalPlan = planBridgeRemoval({
        item,
        selectedGroups,
        nodes,
        nnsList: nns,
        nncps,
        scopeNodeNames,
      });
      if (removalPlan.issues.length > 0) {
        const msg = removalPlan.issues.map((issue) => t(issue.key, issue.values)).join(' ');
        dashboardLogger.warn(LOG_ACTION, 'Remove blocked', msg);
        setRemoveError(msg);
        return;
      }

      setRemoving(true);
      setRemoveError(null);
      setRemoveSuccess(null);
      dashboardLogger.info(
        LOG_ACTION,
        'Remove started',
        `bridge=${item.name} patch=${removalPlan.patchPolicyNames.join(',')} create=${removalPlan.createPolicies
          .map((p) => p.metadata.name)
          .join(',')} delete=${removalPlan.deletePolicyNames.join(',')} skipApply=${removalPlan.skipApply}`,
      );

      try {
        const applied: string[] = [];
        if (!removalPlan.skipApply) {
          for (const name of removalPlan.patchPolicyNames) {
            setRemovePhase(t('Setting {{name}} to absent...', { name: item.name }));
            const current = (await k8sGet({
              model: NodeNetworkConfigurationPolicyModel,
              name,
            })) as NncpKind;
            const updated = (await k8sUpdate({
              model: NodeNetworkConfigurationPolicyModel,
              data: {
                ...current,
                spec: {
                  ...(current.spec || {}),
                  nodeSelector: current.spec?.nodeSelector || {},
                  desiredState: removalPlan.desiredState,
                },
              } as unknown as K8sResourceCommon,
            })) as NncpKind;
            const gen = updated.metadata.generation ?? (current.metadata.generation || 0) + 1;
            applied.push(updated.metadata.name);
            await waitForNncpApply(updated.metadata.name, gen, Date.now());
          }

          for (const policy of removalPlan.createPolicies) {
            setRemovePhase(t('Setting {{name}} to absent...', { name: item.name }));
            const createdPolicy = (await k8sCreate({
              model: NodeNetworkConfigurationPolicyModel,
              data: policy as unknown as K8sResourceCommon,
            })) as NncpKind;
            const gen = createdPolicy.metadata.generation ?? 1;
            applied.push(createdPolicy.metadata.name);
            await waitForNncpApply(createdPolicy.metadata.name, gen, Date.now());
          }
        }

        dashboardLogger.info(
          LOG_ACTION,
          'Absent applied',
          applied.length > 0 ? applied.join(',') : 'skipped',
        );

        for (const name of removalPlan.deletePolicyNames) {
          setRemovePhase(t('Deleting policy {{name}}...', { name }));
          await k8sDelete({
            model: NodeNetworkConfigurationPolicyModel,
            resource: {
              apiVersion: 'nmstate.io/v1',
              kind: 'NodeNetworkConfigurationPolicy',
              metadata: { name },
            },
          });
        }

        dashboardLogger.info(
          LOG_ACTION,
          'Remove succeeded',
          `bridge=${item.name} policies=${removalPlan.deletePolicyNames.join(',')}`,
        );
        setRemoveSuccess(
          removalPlan.skipApply
            ? t('Deleted leftover policy for {{name}}.', { name: item.name })
            : t('Removed bridge {{name}}.', { name: item.name }),
        );
        setRemoveTarget(null);
        setRemovePhase('');
      } catch (err) {
        const msg = getK8sErrorMessage(err);
        dashboardLogger.error(LOG_ACTION, 'Remove failed', msg);
        setRemoveError(msg);
      } finally {
        setRemoving(false);
      }
    },
    [selectedGroups, nodes, nns, nncps, scopeNodeNames, t, waitForNncpApply],
  );

  const requestRemove = useCallback((item: BridgeInventoryItem) => {
    setRemoveTarget(item);
    setRemoveError(null);
    setRemoveSuccess(null);
  }, []);

  /* ---- loading ---- */
  const nnsReady = nnsLoaded || Boolean(nnsError);
  const nodesReady = nodesLoaded || Boolean(nodesError);
  const mcpsReady = mcpsLoaded || Boolean(mcpError);

  const stateColor = (state: string): 'green' | 'grey' | 'orange' => {
    const s = state.toLowerCase();
    if (s === 'up') return 'green';
    if (s === 'down') return 'grey';
    return 'orange';
  };

  const mcpHelper = (group: McpNicGroup): string => {
    const nodeCount = String(group.nodeNames.length);
    if (group.nodeNames.length === 0) return t('No nodes in this pool');
    if (group.noPhysicalNics) {
      return t('{{nodeCount}} nodes, no physical NICs (cannot use as a group)', { nodeCount });
    }
    if (group.missingNns.length > 0) {
      return t('{{nodeCount}} nodes, missing NIC data for some nodes (cannot use as a group)', { nodeCount });
    }
    if (group.mixed) {
      return t('{{nodeCount}} nodes, mixed NIC layouts (cannot use as a group)', { nodeCount });
    }
    if (group.identical) {
      return t('{{nodeCount}} nodes, identical NICs ({{nics}})', { nodeCount, nics: group.fingerprint });
    }
    return t('{{nodeCount}} nodes, mixed NIC layouts (cannot use as a group)', { nodeCount });
  };

  const enslavedLabel = (nic: LayoutNic): string | null => {
    if (nic.enslavedNodeCount === 0 || nic.enslavedControllers.length === 0) return null;
    const controller = nic.enslavedControllers.join(', ');
    if (nic.enslavedNodeCount === nic.targetNodeCount) {
      return `${t('Currently in')} ${controller}`;
    }
    return t('Currently in {{controller}} on {{enslaved}} of {{total}} nodes', {
      controller,
      enslaved: String(nic.enslavedNodeCount),
      total: String(nic.targetNodeCount),
    });
  };

  if (!nnsReady || !nodesReady || !mcpsReady) {
    return (
      <PageSection>
        <Bullseye>
          <Spinner size="xl" />
        </Bullseye>
      </PageSection>
    );
  }

  /* ---- error states ---- */
  const renderDiscoveryError = (): React.ReactNode => {
    if (mcpError && isMissingCrdError(mcpError)) {
      return (
        <EmptyState titleText={t('MachineConfigPool resources are not available.')} icon={ExclamationCircleIcon} headingLevel="h2">
          <EmptyStateBody>{getK8sErrorMessage(mcpError)}</EmptyStateBody>
        </EmptyState>
      );
    }
    if (mcpError && isForbiddenError(mcpError)) {
      return (
        <EmptyState titleText={t('You do not have permission to list MachineConfigPool resources.')} icon={ExclamationCircleIcon} headingLevel="h2">
          <EmptyStateBody>{getK8sErrorMessage(mcpError)}</EmptyStateBody>
        </EmptyState>
      );
    }
    if (mcpError) {
      return (
        <Alert variant="danger" title={t('Failed to load MachineConfigPools')} isInline>
          {getK8sErrorMessage(mcpError)}
        </Alert>
      );
    }

    if (nnsError && isMissingCrdError(nnsError)) {
      return (
        <EmptyState titleText={t('NMState operator not found — NodeNetworkState is required to list NICs.')} icon={NetworkIcon} headingLevel="h2">
          <EmptyStateBody>{t('Install the Kubernetes NMState operator to list physical NICs on cluster nodes.')}</EmptyStateBody>
        </EmptyState>
      );
    }
    if (nnsError && isForbiddenError(nnsError)) {
      return (
        <EmptyState titleText={t('You do not have permission to list NodeNetworkState resources.')} icon={ExclamationCircleIcon} headingLevel="h2">
          <EmptyStateBody>{getK8sErrorMessage(nnsError)}</EmptyStateBody>
        </EmptyState>
      );
    }
    if (nnsError) {
      return (
        <Alert variant="danger" title={t('Failed to load NodeNetworkState')} isInline>
          {getK8sErrorMessage(nnsError)}
        </Alert>
      );
    }

    if (nns.length === 0) {
      return (
        <EmptyState titleText={t('No NodeNetworkState resources found')} icon={NetworkIcon} headingLevel="h2">
          <EmptyStateBody>{t('The NMState operator is installed but has not reported interface state yet.')}</EmptyStateBody>
        </EmptyState>
      );
    }
    if (mcps.length === 0) {
      return (
        <EmptyState titleText={t('No MachineConfigPools found')} icon={NetworkIcon} headingLevel="h2">
          <EmptyStateBody>{t('MachineConfigPools are required to group nodes that share a NIC layout.')}</EmptyStateBody>
        </EmptyState>
      );
    }
    return null;
  };

  const discoveryError = renderDiscoveryError();
  const mixedGroups = mcpGroups.filter((g) => g.mixed || g.missingNns.length > 0 || g.noPhysicalNics);
  const showBridgeForm = !discoveryError;

  /* ---- render ---- */
  return (
    <>
      <DocumentTitle>{t('Network Bridge')}</DocumentTitle>

      <PageSection type="breadcrumb">
        <Breadcrumb>
          <BreadcrumbItem
            component="a"
            onClick={(e) => {
              e.preventDefault();
              goNetworkHub();
            }}
          >
            {t('Network')}
          </BreadcrumbItem>
          <BreadcrumbItem isActive>{t('Network Bridge')}</BreadcrumbItem>
        </Breadcrumb>
      </PageSection>

      <ListPageHeader title={t('Network Bridge')} />

      <PageSection>
        <Stack hasGutter>
          <StackItem>
            <CommunityDisclaimer />
          </StackItem>
          <StackItem>
            <p className="netbridge-lead">
              {t(
                'Create linux-bridge or ovs-bridge interfaces on cluster nodes using NMState. Select MachineConfigPools that share the same physical NIC names, choose a port, and configure bridge options.',
              )}
            </p>
            <p className="netbridge-lead">
              {t(
                'NMState applies each policy to matching nodes. Deleting a policy does not remove a live bridge — Remove sets the bridge to absent first.',
              )}
            </p>
          </StackItem>

          {nodesError && (
            <StackItem>
              <Alert variant="warning" title={t('Could not list Kubernetes Nodes')} isInline>
                {t('Node membership for each pool may be incomplete.')} {getK8sErrorMessage(nodesError)}
              </Alert>
            </StackItem>
          )}

          {nncpError && (
            <StackItem>
              <Alert variant="warning" title={t('Could not list existing network policies')} isInline>
                {t('Bridge name uniqueness against existing policies cannot be checked.')} {getK8sErrorMessage(nncpError)}
              </Alert>
            </StackItem>
          )}

          {/* Section A: MachineConfigPool Selection */}
          {discoveryError ? (
            <StackItem>{discoveryError}</StackItem>
          ) : (
            <StackItem>
              <Card>
                <CardTitle>
                  <Title headingLevel="h2">{t('MachineConfigPools')}</Title>
                </CardTitle>
                <CardBody>
                  <Stack hasGutter>
                    {mixedGroups.length > 0 && (
                      <StackItem>
                        <Alert variant="warning" title={t('Some pools have mixed NIC layouts')} isInline>
                          {t('A MachineConfigPool can be used as a group only when every node in it has the same physical ethernet interface names. Mixed pools are disabled.')}
                        </Alert>
                      </StackItem>
                    )}
                    <StackItem>
                      <Form>
                        <FormGroup label={t('Apply this bridge to')} fieldId="netbridge-mcps" isRequired>
                          <div className="netbridge-mcp-list">
                            {mcpGroups.map((group) => {
                              const compatible = canSelectMcpWith(selectedGroups, group);
                              const checked = selectedMcpNames.includes(group.mcpName);
                              const disabled = !checked && !compatible;
                              const description = !group.identical
                                ? mcpHelper(group)
                                : !compatible
                                  ? t('Different NIC layout than the selected pool(s)')
                                  : mcpHelper(group);
                              return (
                                <Checkbox
                                  key={group.mcpName}
                                  id={`netbridge-mcp-${group.mcpName}`}
                                  className="netbridge-mcp-item"
                                  label={group.mcpName}
                                  description={description}
                                  isChecked={checked}
                                  isDisabled={disabled}
                                  onChange={(_event, isChecked) => toggleMcp(group.mcpName, Boolean(isChecked))}
                                />
                              );
                            })}
                          </div>
                          <FormHelperText>
                            <HelperText>
                              <HelperTextItem>
                                {t('Multiple pools can be selected only when they share the same physical NIC names.')}
                              </HelperTextItem>
                            </HelperText>
                          </FormHelperText>
                        </FormGroup>
                      </Form>
                    </StackItem>
                  </Stack>
                </CardBody>
              </Card>
            </StackItem>
          )}

          {/* Section B: Existing Bridges */}
          {showBridgeForm && (
            <StackItem>
              <Card>
                <CardTitle>
                  <Title headingLevel="h2">{t('Existing bridges')}</Title>
                </CardTitle>
                <CardBody>
                  {bridgeInventory.length === 0 ? (
                    <p className="netbridge-lead">
                      {t('No bridges found on the selected pools. Create one below, or select pools to scope the list.')}
                    </p>
                  ) : (
                    <>
                      <p className="netbridge-lead">
                        {t('Remove sets the bridge to absent with NMState, waits for the policy to apply, then deletes the policy.')}
                      </p>
                      <div className="netbridge-table-wrap">
                        <Table aria-label={t('Existing bridges')} variant="compact">
                          <Thead>
                            <Tr>
                              <Th>{t('Bridge')}</Th>
                              <Th>{t('Type')}</Th>
                              <Th>{t('Port(s)')}</Th>
                              <Th>{t('Nodes')}</Th>
                              <Th>{t('Policy')}</Th>
                              <Th>{t('Remove')}</Th>
                            </Tr>
                          </Thead>
                          <Tbody>
                            {bridgeInventory.map((item) => {
                              const protectedBrEx = item.brExNodeNames.length > 0;
                              const leftover = item.nncpAlreadyAbsent && !item.inNns;
                              const busy = removing && removeTarget?.name === item.name;
                              const removeLabel = leftover ? t('Delete policy') : t('Remove');
                              const button = (
                                <Button
                                  variant="danger"
                                  isDisabled={!item.canRemove || removing}
                                  isLoading={busy}
                                  onClick={() => requestRemove(item)}
                                >
                                  {busy ? t('Removing...') : removeLabel}
                                </Button>
                              );
                              return (
                                <Tr key={item.name}>
                                  <Td dataLabel={t('Bridge')}>
                                    <div>{item.name}</div>
                                    {protectedBrEx && (
                                      <Label isCompact color="red" className="netbridge-bridge-flag">
                                        {t('Protected: carries br-ex')}
                                      </Label>
                                    )}
                                    {leftover && (
                                      <Label isCompact color="grey" className="netbridge-bridge-flag">
                                        {t('Already absent on nodes')}
                                      </Label>
                                    )}
                                    {item.managedByTool && !leftover && (
                                      <div className="netbridge-enslaved">{t('Created by Network Bridge')}</div>
                                    )}
                                  </Td>
                                  <Td dataLabel={t('Type')}>
                                    <Label isCompact color={item.type === 'ovs-bridge' ? 'blue' : 'green'}>
                                      {item.type === 'ovs-bridge' ? 'OVS' : 'Linux'}
                                    </Label>
                                  </Td>
                                  <Td dataLabel={t('Port(s)')}>{item.ports.length > 0 ? item.ports.join(', ') : '—'}</Td>
                                  <Td dataLabel={t('Nodes')}>
                                    {item.nodeNames.length > 0
                                      ? `${item.nodeNames.length}: ${item.nodeNames.join(', ')}`
                                      : leftover
                                        ? t('Not present')
                                        : '—'}
                                  </Td>
                                  <Td dataLabel={t('Policy')}>
                                    {item.nncpNames.length === 0
                                      ? '—'
                                      : item.nncpNames.map((name) => (
                                          <div key={name}>
                                            <Button variant="link" isInline component="a" href={nncpConsolePath(name)}>
                                              {name}
                                            </Button>
                                          </div>
                                        ))}
                                  </Td>
                                  <Td dataLabel={t('Remove')}>
                                    {item.blockReason ? (
                                      <Tooltip content={t(item.blockReason.key, item.blockReason.values)}>
                                        <span className="netbridge-remove-wrap">{button}</span>
                                      </Tooltip>
                                    ) : (
                                      button
                                    )}
                                  </Td>
                                </Tr>
                              );
                            })}
                          </Tbody>
                        </Table>
                      </div>
                      {bridgeInventory.some((i) => i.brExNodeNames.length > 0) && (
                        <Alert className="netbridge-bridge-alert" variant="info" isInline title={t('br-ex is the cluster default network')}>
                          {t('OpenShift OVN uses br-ex as the node default network. This tool will not absent a bridge that br-ex is built on.')}
                        </Alert>
                      )}
                    </>
                  )}
                </CardBody>
              </Card>
            </StackItem>
          )}

          {removeSuccess && (
            <StackItem>
              <Alert variant="success" title={t('Bridge removed')} isInline isLiveRegion>
                {removeSuccess}
              </Alert>
            </StackItem>
          )}

          {/* Section C: Bridge Configuration */}
          {showBridgeForm && selectedFingerprint && (
            <StackItem>
              <Card>
                <CardTitle>
                  <Title headingLevel="h2">{t('Bridge Configuration')}</Title>
                </CardTitle>
                <CardBody>
                  <Form>
                    {/* Bridge Type toggle */}
                    <FormGroup label={t('Bridge Type')} fieldId="netbridge-type">
                      <ToggleGroup aria-label={t('Bridge Type')}>
                        <ToggleGroupItem
                          text={t('Linux Bridge')}
                          buttonId="netbridge-type-linux"
                          isSelected={bridgeType === 'linux-bridge'}
                          onChange={() => setBridgeType('linux-bridge')}
                        />
                        <ToggleGroupItem
                          text={t('OVS Bridge')}
                          buttonId="netbridge-type-ovs"
                          isSelected={bridgeType === 'ovs-bridge'}
                          onChange={() => setBridgeType('ovs-bridge')}
                        />
                      </ToggleGroup>
                    </FormGroup>

                    {/* Port Selection */}
                    <FormGroup label={t('Port Interface')} fieldId="netbridge-port" isRequired>
                      {layoutNics.length === 0 ? (
                        <EmptyState titleText={t('No physical NICs found')} icon={NetworkIcon} headingLevel="h3">
                          <EmptyStateBody>
                            {t('No ethernet or bond interfaces were found on targeted nodes after filtering virtual and CNI devices.')}
                          </EmptyStateBody>
                        </EmptyState>
                      ) : (
                        <div className="netbridge-table-wrap">
                          <Table aria-label={t('Select port interface')} variant="compact">
                            <Thead>
                              <Tr>
                                <Th screenReaderText={t('Select')} />
                                <Th>{t('Interface')}</Th>
                                <Th>{t('Type')}</Th>
                                <Th>{t('State')}</Th>
                                <Th>{t('Speed')}</Th>
                              </Tr>
                            </Thead>
                            <Tbody>
                              {layoutNics.map((nic) => {
                                const enslaved = enslavedLabel(nic);
                                return (
                                  <Tr key={nic.name}>
                                    <Td>
                                      <Radio
                                        id={`netbridge-port-${nic.name}`}
                                        name="netbridge-port"
                                        isChecked={selectedPort === nic.name}
                                        onChange={() => {
                                          setSelectedPort(nic.name);
                                          clearCreated();
                                        }}
                                        aria-label={`${t('Select')} ${nic.name}`}
                                      />
                                    </Td>
                                    <Td dataLabel={t('Interface')}>
                                      {nic.name}
                                      {enslaved && <div className="netbridge-enslaved">{enslaved}</div>}
                                    </Td>
                                    <Td dataLabel={t('Type')}>
                                      <Label isCompact color={nic.type === 'bond' ? 'blue' : 'grey'}>
                                        {nic.type}
                                      </Label>
                                    </Td>
                                    <Td dataLabel={t('State')}>
                                      <Label isCompact color={stateColor(nic.state)}>
                                        {nic.stateMixed ? t('mixed') : nic.state}
                                      </Label>
                                    </Td>
                                    <Td dataLabel={t('Speed')}>
                                      {nic.speedMixed ? t('mixed') : formatSpeed(nic.speedMbps)}
                                    </Td>
                                  </Tr>
                                );
                              })}
                            </Tbody>
                          </Table>
                        </div>
                      )}
                      <FormHelperText>
                        <HelperText>
                          <HelperTextItem>
                            {t('Select the ethernet or bond interface to use as the bridge port. The same interface is used on every targeted node.')}
                          </HelperTextItem>
                        </HelperText>
                      </FormHelperText>
                    </FormGroup>

                    {/* VLAN Tagging */}
                    <FormGroup label={t('VLAN Tagging')} fieldId="netbridge-vlan">
                      <Checkbox
                        id="netbridge-vlan-enable"
                        label={t('Tag VLAN before bridge')}
                        isChecked={enableVlan}
                        onChange={(_event, checked) => setEnableVlan(Boolean(checked))}
                      />
                      {enableVlan && (
                        <div style={{ marginTop: '8px' }}>
                          <NumberInput
                            id="netbridge-vlan-id"
                            value={vlanId ? parseInt(vlanId, 10) : undefined}
                            min={1}
                            max={4094}
                            onMinus={() => setVlanId(String(Math.max(1, (parseInt(vlanId, 10) || 1) - 1)))}
                            onPlus={() => setVlanId(String(Math.min(4094, (parseInt(vlanId, 10) || 0) + 1)))}
                            onChange={(event) => setVlanId((event.target as HTMLInputElement).value)}
                            widthChars={6}
                          />
                          <FormHelperText>
                            <HelperText>
                              <HelperTextItem>
                                {t('VLAN ID (1–4094). Creates a sub-interface like {{example}} before the bridge.', {
                                  example: `${selectedPort || 'eth0'}.${vlanId || '100'}`,
                                })}
                              </HelperTextItem>
                            </HelperText>
                          </FormHelperText>
                        </div>
                      )}
                    </FormGroup>

                    {/* Bridge Name */}
                    <FormGroup label={t('Bridge Name')} fieldId="netbridge-name" isRequired>
                      <TextInput
                        id="netbridge-name"
                        value={bridgeName}
                        onChange={(_event, value) => {
                          setBridgeName(value);
                          clearCreated();
                        }}
                        maxLength={15}
                      />
                      <FormHelperText>
                        <HelperText>
                          <HelperTextItem>{t('Linux interface name, up to 15 characters.')}</HelperTextItem>
                        </HelperText>
                      </FormHelperText>
                    </FormGroup>

                    {/* Bridge Options */}
                    <FormGroup label={t('Bridge Options')} fieldId="netbridge-options">
                      <Checkbox
                        id="netbridge-stp"
                        label={t('STP enabled')}
                        isChecked={stpEnabled}
                        onChange={(_event, checked) => setStpEnabled(Boolean(checked))}
                      />
                      {bridgeType === 'ovs-bridge' && (
                        <>
                          <Checkbox
                            id="netbridge-mcast-snooping"
                            label={t('Multicast Snooping')}
                            isChecked={mcastSnooping}
                            onChange={(_event, checked) => setMcastSnooping(Boolean(checked))}
                          />
                          <Checkbox
                            id="netbridge-extra-patch-ports"
                            label={t('Allow Extra Patch Ports')}
                            isChecked={allowExtraPatchPorts}
                            onChange={(_event, checked) => setAllowExtraPatchPorts(Boolean(checked))}
                          />
                        </>
                      )}
                    </FormGroup>

                    {/* OVN Bridge Mappings (OVS only) */}
                    {bridgeType === 'ovs-bridge' && (
                      <FormGroup label={t('OVN Bridge Mappings')} fieldId="netbridge-ovn-mappings" isRequired>
                        {ovnMappings.map((mapping, idx) => (
                          <div key={idx} className="netbridge-ovn-mapping-row">
                            <TextInput
                              aria-label={t('Localnet name')}
                              placeholder={t('localnet name')}
                              value={mapping.localnet}
                              onChange={(_event, value) => {
                                const updated = [...ovnMappings];
                                updated[idx] = { ...updated[idx], localnet: value };
                                setOvnMappings(updated);
                              }}
                            />
                            <TextInput
                              aria-label={t('Bridge name')}
                              value={mapping.bridge}
                              isDisabled
                            />
                            {ovnMappings.length > 1 && (
                              <Button
                                variant="plain"
                                aria-label={t('Remove mapping')}
                                onClick={() => setOvnMappings(ovnMappings.filter((_, i) => i !== idx))}
                                icon={<MinusCircleIcon />}
                              />
                            )}
                          </div>
                        ))}
                        <Button
                          variant="link"
                          icon={<PlusCircleIcon />}
                          onClick={() => setOvnMappings([...ovnMappings, { localnet: '', bridge: bridgeName }])}
                        >
                          {t('Add mapping')}
                        </Button>
                        <FormHelperText>
                          <HelperText>
                            <HelperTextItem>
                              {t('Map localnet names to this OVS bridge for OVN networking. At least one mapping is required.')}
                            </HelperTextItem>
                          </HelperText>
                        </FormHelperText>
                      </FormGroup>
                    )}

                    {/* IPv4 */}
                    <FormGroup label={t('IPv4')} fieldId="netbridge-ipv4" role="radiogroup">
                      <Radio
                        id="netbridge-ipv4-none"
                        name="netbridge-ipv4"
                        label={t('L2 only (no IP)')}
                        isChecked={ipv4Mode === 'none'}
                        onChange={() => setIpv4Mode('none')}
                      />
                      <Radio
                        id="netbridge-ipv4-dhcp"
                        name="netbridge-ipv4"
                        label={t('DHCP')}
                        isChecked={ipv4Mode === 'dhcp'}
                        onChange={() => setIpv4Mode('dhcp')}
                      />
                      <Radio
                        id="netbridge-ipv4-static"
                        name="netbridge-ipv4"
                        label={t('Static')}
                        isChecked={ipv4Mode === 'static'}
                        onChange={() => setIpv4Mode('static')}
                      />
                      <FormHelperText>
                        <HelperText>
                          <HelperTextItem>
                            {t('Create a bridge without an IP address. Attach IPs later with a NAD or a follow-up policy.')}
                          </HelperTextItem>
                        </HelperText>
                      </FormHelperText>
                    </FormGroup>

                    {ipv4Mode === 'static' && (
                      <>
                        <FormGroup label={t('IP Address')} fieldId="netbridge-ip" isRequired>
                          <TextInput
                            id="netbridge-ip"
                            value={ipAddress}
                            onChange={(_event, value) => setIpAddress(value)}
                            placeholder="192.168.1.10"
                          />
                        </FormGroup>
                        <FormGroup label={t('Prefix Length')} fieldId="netbridge-prefix" isRequired>
                          <TextInput
                            id="netbridge-prefix"
                            value={prefixLength}
                            onChange={(_event, value) => setPrefixLength(value)}
                            type="number"
                          />
                        </FormGroup>
                        <FormGroup label={t('Gateway')} fieldId="netbridge-gw">
                          <TextInput
                            id="netbridge-gw"
                            value={gateway}
                            onChange={(_event, value) => setGateway(value)}
                            placeholder="192.168.1.1"
                          />
                          <FormHelperText>
                            <HelperText>
                              <HelperTextItem>{t('Optional default gateway')}</HelperTextItem>
                            </HelperText>
                          </FormHelperText>
                        </FormGroup>
                      </>
                    )}
                  </Form>
                </CardBody>
              </Card>
            </StackItem>
          )}

          {showBridgeForm && !selectedFingerprint && selectedMcpNames.length === 0 && (
            <StackItem>
              <Alert variant="info" title={t('Select a MachineConfigPool')} isInline>
                {t('Choose one or more pools with identical NICs to see the bridge configuration.')}
              </Alert>
            </StackItem>
          )}

          {/* Section D: Review + Create */}
          {showBridgeForm && (
            <StackItem>
              <Card>
                <CardTitle>
                  <Title headingLevel="h2">{t('Review')}</Title>
                </CardTitle>
                <CardBody>
                  <Stack hasGutter>
                    {plan.warnings.map((w) => (
                      <StackItem key={w.key}>
                        <Alert variant="warning" title={t('Warning')} isInline>
                          {t(w.key, w.values)}
                        </Alert>
                      </StackItem>
                    ))}
                    {createdNames.length === 0 &&
                      plan.issues.map((issue) => (
                        <StackItem key={issue.key + JSON.stringify(issue.values || {})}>
                          <Alert variant="danger" isInline title={t(issue.key, issue.values)} />
                        </StackItem>
                      ))}

                    <StackItem>
                      <DescriptionList isHorizontal columnModifier={{ default: '2Col' }}>
                        <DescriptionListGroup>
                          <DescriptionListTerm>{t('Pools')}</DescriptionListTerm>
                          <DescriptionListDescription>
                            {selectedMcpNames.length > 0 ? selectedMcpNames.join(', ') : '—'}
                          </DescriptionListDescription>
                        </DescriptionListGroup>
                        <DescriptionListGroup>
                          <DescriptionListTerm>{t('Target nodes')}</DescriptionListTerm>
                          <DescriptionListDescription>
                            {plan.targetNodeNames.length > 0
                              ? `${plan.targetNodeNames.length}: ${plan.targetNodeNames.join(', ')}`
                              : '—'}
                          </DescriptionListDescription>
                        </DescriptionListGroup>
                        <DescriptionListGroup>
                          <DescriptionListTerm>{t('Bridge Type')}</DescriptionListTerm>
                          <DescriptionListDescription>
                            {bridgeType === 'ovs-bridge' ? t('OVS Bridge') : t('Linux Bridge')}
                          </DescriptionListDescription>
                        </DescriptionListGroup>
                        <DescriptionListGroup>
                          <DescriptionListTerm>{t('Bridge Name')}</DescriptionListTerm>
                          <DescriptionListDescription>{bridgeName || '—'}</DescriptionListDescription>
                        </DescriptionListGroup>
                        <DescriptionListGroup>
                          <DescriptionListTerm>{t('Port')}</DescriptionListTerm>
                          <DescriptionListDescription>{selectedPort || '—'}</DescriptionListDescription>
                        </DescriptionListGroup>
                        {enableVlan && vlanId && (
                          <DescriptionListGroup>
                            <DescriptionListTerm>{t('VLAN ID')}</DescriptionListTerm>
                            <DescriptionListDescription>{vlanId}</DescriptionListDescription>
                          </DescriptionListGroup>
                        )}
                        <DescriptionListGroup>
                          <DescriptionListTerm>{t('IPv4')}</DescriptionListTerm>
                          <DescriptionListDescription>
                            {ipv4Mode === 'none'
                              ? t('L2 only (no IP)')
                              : ipv4Mode === 'dhcp'
                                ? t('DHCP')
                                : `${ipAddress}/${prefixLength}`}
                          </DescriptionListDescription>
                        </DescriptionListGroup>
                        <DescriptionListGroup>
                          <DescriptionListTerm>{t('Policies to create')}</DescriptionListTerm>
                          <DescriptionListDescription>
                            {plan.policies.length > 0 ? `${plan.policies.length}` : '—'}
                          </DescriptionListDescription>
                        </DescriptionListGroup>
                      </DescriptionList>
                    </StackItem>

                    {previewYaml && (
                      <StackItem>
                        <Title headingLevel="h3">{t('YAML preview')}</Title>
                        <div className="netbridge-review-yaml">
                          <CodeBlock>
                            <CodeBlockCode>{previewYaml}</CodeBlockCode>
                          </CodeBlock>
                        </div>
                      </StackItem>
                    )}

                    {createError && (
                      <StackItem>
                        <Alert variant="danger" title={t('Failed to create bridge')} isInline>
                          {createError}
                        </Alert>
                      </StackItem>
                    )}

                    {createdNames.length > 0 && (
                      <StackItem>
                        <Alert variant="success" title={t('Bridge created')} isInline>
                          <p>{t('Created {{names}}.', { names: createdNames.join(', ') })}</p>
                          {createdNames.map((name) => (
                            <div key={name}>
                              <Button variant="link" isInline component="a" href={nncpConsolePath(name)}>
                                {t('Open {{name}}', { name })}
                              </Button>
                            </div>
                          ))}
                        </Alert>
                      </StackItem>
                    )}

                    <StackItem>
                      <div className="netbridge-actions">
                        <ActionGroup>
                          <Button
                            variant="primary"
                            onClick={handleCreate}
                            isDisabled={
                              creating ||
                              createdNames.length > 0 ||
                              plan.policies.length === 0 ||
                              plan.issues.length > 0
                            }
                            isLoading={creating}
                          >
                            {creating ? t('Creating...') : t('Create')}
                          </Button>
                          {createdNames.length > 0 && (
                            <Button variant="secondary" onClick={handleCreateAnother}>
                              {t('Create another bridge')}
                            </Button>
                          )}
                          <Button variant="link" onClick={goNetworkHub}>
                            {t('Back to Network')}
                          </Button>
                        </ActionGroup>
                      </div>
                    </StackItem>
                  </Stack>
                </CardBody>
              </Card>
            </StackItem>
          )}
        </Stack>
      </PageSection>

      {/* Remove modal */}
      <Modal
        isOpen={Boolean(removeTarget)}
        onClose={(_event) => closeRemoveModal()}
        variant="small"
        aria-labelledby="netbridge-remove-title"
        aria-describedby="netbridge-remove-desc"
      >
        <ModalHeader
          title={
            removeTarget?.nncpAlreadyAbsent && !removeTarget.inNns
              ? t('Delete leftover policy')
              : t('Remove bridge')
          }
          labelId="netbridge-remove-title"
          titleIconVariant="warning"
        />
        <ModalBody id="netbridge-remove-desc">
          {removeTarget && (
            <Stack hasGutter>
              {removePlanPreview?.issues.map((issue) => (
                <StackItem key={issue.key}>
                  <Alert variant="danger" isInline title={t(issue.key, issue.values)} />
                </StackItem>
              ))}
              {removePlanPreview?.warnings.map((w) => (
                <StackItem key={w.key}>
                  <Alert variant="warning" isInline title={t(w.key, w.values)} />
                </StackItem>
              ))}
              <StackItem>
                {removeTarget.nncpAlreadyAbsent && !removeTarget.inNns
                  ? t('Bridge {{name}} is already absent on the nodes. Delete the leftover policy {{policies}}?', {
                      name: removeTarget.name,
                      policies: removeTarget.nncpNames.join(', ') || '—',
                    })
                  : t('This sets bridge {{name}} to absent with NMState, waits for the apply to succeed, then deletes the policy. This cannot be undone from this page.', {
                      name: removeTarget.name,
                    })}
              </StackItem>
              {removePhase && removing && (
                <StackItem>
                  <Alert variant="info" isInline title={removePhase} />
                </StackItem>
              )}
              {removeError && (
                <StackItem>
                  <Alert variant="danger" isInline title={t('Failed to remove bridge')}>
                    {removeError}
                  </Alert>
                </StackItem>
              )}
            </Stack>
          )}
        </ModalBody>
        <ModalFooter>
          <Button
            variant="danger"
            onClick={() => removeTarget && handleRemove(removeTarget)}
            isDisabled={removing || !removeTarget?.canRemove || Boolean(removePlanPreview && removePlanPreview.issues.length > 0)}
            isLoading={removing}
          >
            {removing
              ? t('Removing...')
              : removeTarget?.nncpAlreadyAbsent && !removeTarget.inNns
                ? t('Delete policy')
                : t('Remove bridge')}
          </Button>
          <Button variant="link" onClick={closeRemoveModal} isDisabled={removing}>
            {t('Cancel')}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
};

export default NetworkBridgePage;
