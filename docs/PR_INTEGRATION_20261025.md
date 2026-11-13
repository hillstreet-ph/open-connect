# Integrated pull requests — 2026-10-25

PR #416 integrated and validated the following changes. GitHub auto-merge squashed the integration as `2f26ada75fbe4f04c81f2e20c2e68ed4a31b82e4`, preserving the deployed tree but dropping the individual source heads from main's ancestry. This follow-up retains those reviewed source heads through an explicit merge without changing application code or rewriting existing history.

| PR | Reviewed source head |
| --- | --- |
| [#390](https://github.com/hillstreet-ph/open-connect/pull/390) | `fdf1a2b3772d02cf30cd2d963ed6858379a2157a` |
| [#387](https://github.com/hillstreet-ph/open-connect/pull/387) | `b8edbae03ea811e8b9520b1f452ce73008795b7b` |
| [#386](https://github.com/hillstreet-ph/open-connect/pull/386) | `6c558331b074cdfd4be1c712b6c65f0c4af187bf` |
| [#385](https://github.com/hillstreet-ph/open-connect/pull/385) | `08dfdc23ba492048273ee5a4bbdf836ff9a1c80e` |
| [#384](https://github.com/hillstreet-ph/open-connect/pull/384) | `4d12fc65ea94e8c18e8b968f3dc9c942416cc95b` |
| [#383](https://github.com/hillstreet-ph/open-connect/pull/383) | `dc34b6f7a9ca8f3db767233ec6317af0f06751b9` |
| [#382](https://github.com/hillstreet-ph/open-connect/pull/382) | `f7ed950c11a731f5e08f34cd1f845d9dc4c8005b` |
| [#381](https://github.com/hillstreet-ph/open-connect/pull/381) | `4fdbcb07b581fc64d2e5cab20921557e9e2330f9` |
| [#380](https://github.com/hillstreet-ph/open-connect/pull/380) | `095bb8b62207bf2ab00962e0a067cddb2b7b3c72` |
| [#379](https://github.com/hillstreet-ph/open-connect/pull/379) | `d21988e6acef9661fa136f7434c3fb475465940d` |
| [#378](https://github.com/hillstreet-ph/open-connect/pull/378) | `c184857eadad5450bf2ea688b5d9c34b81a249d8` |
| [#377](https://github.com/hillstreet-ph/open-connect/pull/377) | `354e92cdef32636e477acf30e585687032311639` |
| [#376](https://github.com/hillstreet-ph/open-connect/pull/376) | `7087adf4d225b9bf52d758ff832cbca39f65322b` |
| [#375](https://github.com/hillstreet-ph/open-connect/pull/375) | `338a3fa726fe47512d0632e2eabd02e39be7ca51` |

Validation in #416: full test suite, strict TypeScript, lint with no errors, production build, SSR, resource integrity, dependency audit, and PDF dependency smoke. The combined dependency lock was resolved once; TanStack Start was aligned with the updated router. The approvals route reuses the canonical protected approval panel. Direct browser controller acceptance verified browser-origin frames, typing, click handling and navigation, with explicit temporary-session teardown.

This history-only follow-up adds this record and preserves all source heads as parents. It does not revert the resolved dependency lock, reintroduce duplicate controls, alter permissions, copy credentials or widen resource visibility. The runtime tree from #416 is retained.
