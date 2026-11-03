/**
 * Restart the pods whose Multus networks sat on a NIC that was just
 * re-activated (bridge added/removed): their macvlan/ipvlan interfaces are gone
 * and only a new pod gets new ones. One pod at a time, waiting for its owner to
 * be fully Ready again; Ceph monitors first so quorum is never lost.
 */
import { K8sResourceCommon, k8sDelete, k8sGet, k8sListItems } from '@openshift-console/dynamic-plugin-sdk';

import { DaemonSetModel, PodModel, ReplicaSetModel, StatefulSetModel } from './k8s-resources';

type OwnerRef = { kind?: string; name?: string };

type PodKind = K8sResourceCommon & {
  metadata: K8sResourceCommon['metadata'] & { name: string; namespace: string; ownerReferences?: OwnerRef[] };
  status?: { phase?: string };
};

export type AffectedPod = {
  namespace: string;
  name: string;
  app: string;
  ownerKind?: string;
  ownerName?: string;
};

const NETWORK_STATUS = 'k8s.v1.cni.cncf.io/network-status';

/** Restart order: Ceph mons, other Ceph daemons, then everything else. */
function rank(p: AffectedPod): number {
  if (p.app === 'rook-ceph-mon') return 0;
  if (p.app.startsWith('rook-ceph-')) return 1;
  return 2;
}

/** Running pods attached to any of the given NADs (namespace/name). */
export async function findPodsOnNads(nads: string[]): Promise<AffectedPod[]> {
  if (nads.length === 0) return [];
  const want = new Set(nads);
  const pods = (await k8sListItems({ model: PodModel, queryParams: {} })) as PodKind[];
  const out: AffectedPod[] = [];
  for (const pod of pods) {
    if (pod.status?.phase !== 'Running' || pod.metadata.deletionTimestamp) continue;
    let status: Array<{ name?: string }> = [];
    try {
      status = JSON.parse(pod.metadata.annotations?.[NETWORK_STATUS] || '[]');
    } catch {
      continue;
    }
    if (!status.some((s) => s.name && want.has(s.name))) continue;
    const owner = (pod.metadata.ownerReferences || [])[0];
    out.push({
      namespace: pod.metadata.namespace,
      name: pod.metadata.name,
      app: pod.metadata.labels?.app || '',
      ownerKind: owner?.kind,
      ownerName: owner?.name,
    });
  }
  return out.sort((a, b) => rank(a) - rank(b) || a.namespace.localeCompare(b.namespace) || a.name.localeCompare(b.name));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function ownerReady(p: AffectedPod): Promise<boolean> {
  const ns = p.namespace;
  const name = p.ownerName as string;
  if (p.ownerKind === 'ReplicaSet') {
    const rs = (await k8sGet({ model: ReplicaSetModel, name, ns })) as { spec?: { replicas?: number }; status?: { readyReplicas?: number } };
    return (rs.status?.readyReplicas || 0) >= (rs.spec?.replicas ?? 1);
  }
  if (p.ownerKind === 'StatefulSet') {
    const sts = (await k8sGet({ model: StatefulSetModel, name, ns })) as { spec?: { replicas?: number }; status?: { readyReplicas?: number } };
    return (sts.status?.readyReplicas || 0) >= (sts.spec?.replicas ?? 1);
  }
  if (p.ownerKind === 'DaemonSet') {
    const ds = (await k8sGet({ model: DaemonSetModel, name, ns })) as { status?: { numberReady?: number; desiredNumberScheduled?: number } };
    return (ds.status?.numberReady || 0) >= (ds.status?.desiredNumberScheduled || 0);
  }
  return true;
}

async function gone(p: AffectedPod, uid: string | undefined): Promise<boolean> {
  try {
    const cur = (await k8sGet({ model: PodModel, name: p.name, ns: p.namespace })) as PodKind;
    return !!uid && cur.metadata.uid !== uid;
  } catch {
    return true;
  }
}

/**
 * Deletes each pod and waits (up to 10 minutes) for its owner to be Ready
 * again before the next one. Pods without a ReplicaSet/StatefulSet/DaemonSet
 * owner are skipped: nothing would recreate them.
 */
export async function restartPodsOneByOne(
  pods: AffectedPod[],
  progress: (message: string) => void,
): Promise<{ restarted: string[]; skipped: string[] }> {
  const restarted: string[] = [];
  const skipped: string[] = [];
  for (const p of pods) {
    const id = `${p.namespace}/${p.name}`;
    if (!p.ownerKind || !['ReplicaSet', 'StatefulSet', 'DaemonSet'].includes(p.ownerKind)) {
      skipped.push(id);
      continue;
    }
    progress(`Restarting ${id}`);
    const cur = (await k8sGet({ model: PodModel, name: p.name, ns: p.namespace })) as PodKind;
    await k8sDelete({ model: PodModel, resource: cur });
    const end = Date.now() + 10 * 60_000;
    for (;;) {
      await sleep(5_000);
      if ((await gone(p, cur.metadata.uid)) && (await ownerReady(p))) break;
      if (Date.now() > end) throw new Error(`Timed out waiting for ${id} to come back Ready.`);
      progress(`Waiting for a replacement of ${id} to be Ready`);
    }
    restarted.push(id);
  }
  return { restarted, skipped };
}
