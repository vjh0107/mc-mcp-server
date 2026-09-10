import type { Bot } from 'mineflayer';
import { log } from '../logger.ts';

const ACCEPTED = 3;
const SUCCESSFULLY_LOADED = 0;

export interface ResourcePackClient {
  on: (event: 'add_resource_pack', listener: (data: { uuid: string }) => void) => unknown;
  write: (name: string, params: unknown) => void;
}

export function acceptResourcePacks(client: ResourcePackClient, botName: string): void {
  client.on('add_resource_pack', (data) => {
    client.write('resource_pack_receive', { uuid: data.uuid, result: ACCEPTED });
    client.write('resource_pack_receive', { uuid: data.uuid, result: SUCCESSFULLY_LOADED });
    log('debug', 'accepted resource pack', { bot: botName, uuid: data.uuid });
  });
}

export function applyProtocolPatches(bot: Bot, botName: string): void {
  acceptResourcePacks(bot._client as unknown as ResourcePackClient, botName);
}
