import net from 'node:net';

const CLUSTER_SUFFIX = /\.svc(\.cluster\.local)?\.?$|\.cluster\.local\.?$/;

export function isClusterInternal(host: string): boolean {
  return CLUSTER_SUFFIX.test(host);
}

interface ConnectableClient {
  setSocket: (socket: net.Socket) => void;
}

export interface ConnectOverride {
  connect?: (client: ConnectableClient) => void;
}

export function connectOverride(host: string, port: number): ConnectOverride {
  if (!isClusterInternal(host)) {
    return {};
  }

  return {
    connect: (client) => {
      client.setSocket(net.connect(port, host));
    },
  };
}
