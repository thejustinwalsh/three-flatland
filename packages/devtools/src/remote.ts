/**
 * Remote-debugging attach for the dashboard side (#114).
 *
 * Connect the dashboard's page to a `flatland-devtools-relay` (or any
 * WS endpoint a remote game's provider bridge is connected to) and the
 * remote provider appears on the local bus exactly like an in-page one
 * — discovery, subscribe flow, stats, buffers, all unchanged.
 *
 * ```ts
 * import { connectRemoteDevtools } from '@three-flatland/devtools'
 * const remote = connectRemoteDevtools('ws://192.168.1.20:8123')
 * // … later
 * remote.dispose()
 * ```
 */
import { createConsumerRemoteBridge, type RemoteBridgeHandle, type WebSocketLike } from 'three-flatland'
import { DISCOVERY_CHANNEL } from 'three-flatland/debug-protocol'

export interface ConnectRemoteDevtoolsOptions {
  /** Override the discovery channel (matches the provider's override). */
  discoveryChannelName?: string
}

export function connectRemoteDevtools(
  remote: string | WebSocketLike,
  options: ConnectRemoteDevtoolsOptions = {}
): RemoteBridgeHandle {
  return createConsumerRemoteBridge({
    remote,
    discoveryChannelName: options.discoveryChannelName ?? DISCOVERY_CHANNEL,
  })
}
