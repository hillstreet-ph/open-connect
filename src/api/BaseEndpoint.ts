import { RestEndpoint, type RestGenerics } from "@data-client/rest";

/** Shared browser REST endpoint. Authentication remains in the existing Supabase session layer. */
export class BaseEndpoint<O extends RestGenerics = RestGenerics> extends RestEndpoint<O> {
  urlPrefix = "";

  getHeaders(headers: HeadersInit): HeadersInit {
    return { Accept: "application/json", ...headers };
  }
}
