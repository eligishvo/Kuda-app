// Entry point of the Cloudflare Worker: hands each request to the handler with the real KV store.
import { Env, handle } from './handler';

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, env);
  },
};
