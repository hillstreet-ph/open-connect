import { RestEndpoint, type RestGenerics } from "@data-client/rest";

/** Shared same-origin REST endpoint for typed, normalized client reads. */
export class BaseEndpoint<O extends RestGenerics = RestGenerics> extends RestEndpoint<O> {
  urlPrefix = "";

  getHeaders(headers: HeadersInit): HeadersInit {
    return { Accept: "application/json", ...headers };
  }
}
