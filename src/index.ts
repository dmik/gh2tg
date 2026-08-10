import { handleRequest } from './worker';


export default { fetch: handleRequest } satisfies ExportedHandler <Env>;
