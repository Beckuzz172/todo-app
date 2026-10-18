import { proxyCards } from '../../server/cards-proxy.mjs';
export default { fetch: request => proxyCards(request) };
